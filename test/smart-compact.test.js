const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');

const SCRIPT = path.join(__dirname, '..', 'hooks', 'smart-compact.js');

function setup() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'smart-compact-'));
  const transcript = path.join(dir, 't.jsonl');
  const big = 'x'.repeat(100000);
  fs.writeFileSync(transcript, [
    JSON.stringify({ type: 'user', message: { role: 'user', content: 'old task ' + big } }),
    JSON.stringify({ type: 'assistant', message: { role: 'assistant', content: [{ type: 'text', text: 'done' }] } }),
  ].join('\n'));
  return { dir, transcript, typed: path.join(dir, 'typed.txt'), cwd: path.join(dir, 'project') };
}

function run(mode, input, env) {
  const r = spawnSync(process.execPath, [SCRIPT, mode], {
    input: JSON.stringify(input), encoding: 'utf8',
    env: { ...process.env, SMART_COMPACT_CHILD: '', SMART_COMPACT_OFF: '', SMART_COMPACT_MODE: '', ...env },
  });
  return r.stdout ? JSON.parse(r.stdout) : null;
}

// typed keystrokes per hook call, as plain text, one line per call
function typedText(s) {
  return fs.readFileSync(s.typed, 'utf8').trim().split('\n').map(l => JSON.parse(l).map(x => x[1]).join(''));
}

function envFor(s, judge) {
  return { CLAUDE_PLUGIN_DATA: s.dir, SMART_COMPACT_DRY_TYPE: s.typed, SMART_COMPACT_FAKE_JUDGE: judge, SMART_COMPACT_CAVEMAN: '0' };
}

const pendingFiles = s => (fs.existsSync(path.join(s.dir, 'pending')) ? fs.readdirSync(path.join(s.dir, 'pending')) : []);

test('new task: blocks, archives, types /compact; resume injects task and archive path, types go', () => {
  const s = setup();
  const input = { session_id: 'abc', cwd: s.cwd, transcript_path: s.transcript, prompt: 'build a new login page' };
  const out = run('prompt', input, envFor(s, 'new'));
  assert.equal(out.decision, 'block');
  assert.equal(pendingFiles(s).length, 1);
  assert.equal(typedText(s)[0], '\x03/compact Keep only what helps with the next task: fake focus\r\r');
  const archives = fs.readdirSync(path.join(s.dir, 'archive'));
  assert.equal(archives.length, 1);
  assert.match(fs.readFileSync(path.join(s.dir, 'archive', archives[0]), 'utf8'), /task: fake old task[\s\S]*user: old task x/);

  // /compact keeps the session id, /clear makes a new one: the pending task is found by cwd either way
  const res = run('resume', { session_id: 'new-session-after-clear', cwd: s.cwd }, envFor(s, 'new'));
  const ctx = res.hookSpecificOutput.additionalContext;
  assert.match(ctx, /build a new login page/);
  assert.ok(ctx.includes(archives[0]));
  assert.equal(typedText(s)[1], 'Start the pending task.\r');

  // the typed resume message passes and clears the pending task
  assert.equal(run('prompt', { ...input, prompt: 'Start the pending task.' }, envFor(s, 'new')), null);
  assert.equal(pendingFiles(s).length, 0);
});

test('clear mode types /clear and says so on resume', () => {
  const s = setup();
  const env = { ...envFor(s, 'new'), SMART_COMPACT_MODE: 'clear' };
  const input = { session_id: 'abc', cwd: s.cwd, transcript_path: s.transcript, prompt: 'next thing' };
  assert.equal(run('prompt', input, env).decision, 'block');
  assert.equal(typedText(s)[0], '\x03/clear\r\r');
  assert.match(run('resume', { session_id: 'x', cwd: s.cwd }, env).hookSpecificOutput.additionalContext, /freed the context \(clear\)/);
});

test('passes through: same task, judge error, slash, same:, small context, child', () => {
  const s = setup();
  const input = { session_id: 'abc', cwd: s.cwd, transcript_path: s.transcript, prompt: 'tweak it' };
  assert.equal(run('prompt', input, envFor(s, 'same')), null);
  assert.equal(run('prompt', input, envFor(s, 'error')), null);
  assert.equal(run('prompt', { ...input, prompt: '/compact' }, envFor(s, 'new')), null);
  assert.equal(run('prompt', { ...input, prompt: 'same: do x' }, envFor(s, 'new')), null);
  assert.equal(run('prompt', input, { ...envFor(s, 'new'), SMART_COMPACT_MIN_TOKENS: '999999' }), null);
  assert.equal(run('prompt', input, { ...envFor(s, 'new'), SMART_COMPACT_CHILD: '1' }), null);
  assert.ok(!fs.existsSync(s.typed));
  assert.equal(pendingFiles(s).length, 0);
});

test('context before the last compact boundary is ignored', () => {
  const s = setup();
  fs.appendFileSync(s.transcript, '\n' + JSON.stringify({ type: 'system', subtype: 'compact_boundary' }));
  assert.equal(run('prompt', { session_id: 'abc', cwd: s.cwd, transcript_path: s.transcript, prompt: 'x' }, envFor(s, 'new')), null);
});

test('new: forces the switch without the judge', () => {
  const s = setup();
  const out = run('prompt', { session_id: 'abc', cwd: s.cwd, transcript_path: s.transcript, prompt: 'new: write docs' }, envFor(s, 'error'));
  assert.equal(out.decision, 'block');
});

test('resume without pending task does nothing', () => {
  const s = setup();
  assert.equal(run('resume', { session_id: 'none', cwd: s.cwd }, envFor(s, 'new')), null);
});
