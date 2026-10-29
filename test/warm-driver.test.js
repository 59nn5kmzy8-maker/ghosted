// The cache-warming drivers run a program in a hidden terminal and type one message into it after a delay:
// warm-pty.py (python3 pty) on macOS and Linux, warm-pty.ps1 (ConPTY) on Windows.
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawn, spawnSync } = require('child_process');

const WIN = process.platform === 'win32';
const HOOKS = path.join(__dirname, '..', 'hooks');
const FAKE = path.join(__dirname, '..', 'ci', 'fake-tui.js');
const noPython = !WIN && spawnSync('python3', ['-c', 'import pty'], { stdio: 'ignore' }).status !== 0;

test('warm driver types the message into a real terminal after the delay', { skip: noPython && 'python3 not available', timeout: 90000 }, async () => {
  const out = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'ghosted-warm-')), 'got.json');
  const message = 'ghosted_ keep-warm ping. Reply with only: ok';
  const child = WIN
    ? spawn('powershell.exe', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', path.join(HOOKS, 'warm-pty.ps1'), '-Job',
      Buffer.from(JSON.stringify({ delay: 1, message, exe: process.execPath, args: [FAKE, out] })).toString('base64')], { stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true })
    : spawn('python3', [path.join(HOOKS, 'warm-pty.py'), '1', message, process.execPath, FAKE, out], { stdio: 'ignore', detached: true });
  try {
    const t0 = Date.now();
    let log = '';
    child.stdout?.on('data', d => { log += d; }); child.stderr?.on('data', d => { log += d; });
    while (!fs.existsSync(out) && Date.now() - t0 < 60000) await new Promise(r => setTimeout(r, 250));
    assert.ok(fs.existsSync(out), 'nothing typed; driver output:\n' + log);
    const got = JSON.parse(fs.readFileSync(out, 'utf8'));
    assert.equal(got.received, message);
    assert.ok(got.isTTY && got.stdoutTTY, 'runs in a terminal, like the interactive app');
  } finally {
    if (WIN) spawnSync('taskkill', ['/PID', String(child.pid), '/T', '/F']);
    else try { process.kill(-child.pid, 'SIGTERM'); } catch {}
  }
});

test('terminal bridge passes keys from the hook pipe to the program', { skip: (WIN || noPython) && 'macOS and Linux with python3', timeout: 60000 }, async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ghosted-bridge-'));
  const out = path.join(dir, 'got.json'), envFile = path.join(dir, 'env');
  // the stand-in records GHOSTED_PTY_INJECT so the test can write into the bridge like the hook does
  const wrapper = path.join(dir, 'tui.sh');
  fs.writeFileSync(wrapper, `#!/bin/sh\necho "$GHOSTED_PTY_INJECT" > "${envFile}"\nexec "${process.execPath}" "${FAKE}" "${out}"\n`, { mode: 0o755 });
  const child = spawn('python3', [path.join(HOOKS, 'ghosted-pty.py'), wrapper], { stdio: ['pipe', 'ignore', 'ignore'], detached: true });
  try {
    const t0 = Date.now();
    while (!(fs.existsSync(envFile) && fs.readFileSync(envFile, 'utf8').trim()) && Date.now() - t0 < 20000) await new Promise(r => setTimeout(r, 100));
    const fifo = fs.readFileSync(envFile, 'utf8').trim();
    await new Promise(r => setTimeout(r, 500));
    const r = spawnSync(process.execPath, [path.join(HOOKS, 'ghosted.js'), 'type'], {
      env: { ...process.env, GHOSTED_PTY_INJECT: fifo, GHOSTED_TYPE_JOB: JSON.stringify({ term: { kind: 'bridge', fifo }, steps: [[0, 'Start the pending task.'], [0.3, '\r']] }) },
      input: '', encoding: 'utf8',
    });
    assert.equal(r.status, 0, r.stderr);
    while (!fs.existsSync(out) && Date.now() - t0 < 30000) await new Promise(r => setTimeout(r, 100));
    const got = JSON.parse(fs.readFileSync(out, 'utf8'));
    assert.equal(got.received, 'Start the pending task.');
    assert.ok(got.isTTY, 'the program runs in a terminal');
  } finally {
    try { process.kill(-child.pid, 'SIGTERM'); } catch {}
  }
});

test('/ghosted setup adds and removes the claude shell function', { skip: WIN && 'not needed on Windows' }, () => {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'ghosted-home-'));
  fs.writeFileSync(path.join(home, '.zshrc'), 'export FOO=1\n');
  const data = path.join(home, 'data');
  const cmd = (...a) => spawnSync(process.execPath, [path.join(HOOKS, 'ghosted.js'), 'cmd', data, ...a], { encoding: 'utf8', env: { ...process.env, HOME: home, SHELL: '/bin/zsh' } }).stdout;
  assert.match(cmd('setup'), /added a `claude` shell function/);
  const rc = fs.readFileSync(path.join(home, '.zshrc'), 'utf8');
  assert.match(rc, /^export FOO=1\n/);
  assert.match(rc, /claude\(\) \{[\s\S]*ghosted-pty\.py[\s\S]*command claude "\$@"/);
  assert.ok(fs.existsSync(path.join(data, 'ghosted-pty.py')));
  cmd('setup'); // idempotent: one block
  assert.equal(fs.readFileSync(path.join(home, '.zshrc'), 'utf8').split('>>> ghosted_').length, 2);
  // the function must parse in a real shell
  if (spawnSync('zsh', ['-c', 'true']).status === 0) assert.equal(spawnSync('zsh', ['-n', path.join(home, '.zshrc')]).status, 0);
  assert.match(cmd('setup', 'off'), /removed/);
  assert.equal(fs.readFileSync(path.join(home, '.zshrc'), 'utf8'), 'export FOO=1\n');
});
