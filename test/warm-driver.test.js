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
