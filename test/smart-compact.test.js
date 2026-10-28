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
  return { dir, transcript, typed: path.join(dir, 'typed.txt') };
}

function run(mode, input, env) {
  const r = spawnSync('node', [SCRIPT, mode], {
    input: JSON.stringify(input), encoding: 'utf8',
    env: { ...process.env, SMART_COMPACT_CHILD: '', SMART_COMPACT_OFF: '', ...env },
  });
  return r.stdout ? JSON.parse(r.stdout) : null;
}

function envFor(s, judge) {
  return { CLAUDE_PLUGIN_DATA: s.dir, SMART_COMPACT_DRY_TYPE: s.typed, SMART_COMPACT_FAKE_JUDGE: judge };
}

test('new task blocks, saves prompt, types /compact; resume injects and types go', () => {
  const s = setup();
  const input = { session_id: 'abc', transcript_path: s.transcript, prompt: 'build a new login page' };
  const out = run('prompt', input, envFor(s, 'new'));
  assert.equal(out.decision, 'block');
  assert.equal(fs.readFileSync(path.join(s.dir, 'pending', 'abc.md'), 'utf8'), 'build a new login page');
  assert.match(fs.readFileSync(s.typed, 'utf8'), /^\x03\/compact Keep only what helps with the next task: fake focus\r\n$/);

  const res = run('resume', { session_id: 'abc' }, envFor(s, 'new'));
  assert.match(res.hookSpecificOutput.additionalContext, /build a new login page/);
  assert.match(fs.readFileSync(s.typed, 'utf8'), /Start the pending task\.\r\n$/);

  // the typed resume message passes and clears the pending task
  assert.equal(run('prompt', { ...input, prompt: 'Start the pending task.' }, envFor(s, 'new')), null);
  assert.ok(!fs.existsSync(path.join(s.dir, 'pending', 'abc.md')));
});

test('passes through: same task, judge error, slash, same:, small context, child', () => {
  const s = setup();
  const input = { session_id: 'abc', transcript_path: s.transcript, prompt: 'tweak it' };
  assert.equal(run('prompt', input, envFor(s, 'same')), null);
  assert.equal(run('prompt', input, envFor(s, 'error')), null);
  assert.equal(run('prompt', { ...input, prompt: '/compact' }, envFor(s, 'new')), null);
  assert.equal(run('prompt', { ...input, prompt: 'same: do x' }, envFor(s, 'new')), null);
  assert.equal(run('prompt', input, { ...envFor(s, 'new'), SMART_COMPACT_MIN_TOKENS: '999999' }), null);
  assert.equal(run('prompt', input, { ...envFor(s, 'new'), SMART_COMPACT_CHILD: '1' }), null);
  assert.ok(!fs.existsSync(s.typed));
});

test('context before the last compact boundary is ignored', () => {
  const s = setup();
  fs.appendFileSync(s.transcript, '\n' + JSON.stringify({ type: 'system', subtype: 'compact_boundary' }));
  assert.equal(run('prompt', { session_id: 'abc', transcript_path: s.transcript, prompt: 'x' }, envFor(s, 'new')), null);
});

test('new: forces compaction without judge', () => {
  const s = setup();
  const out = run('prompt', { session_id: 'abc', transcript_path: s.transcript, prompt: 'new: write docs' }, envFor(s, 'error'));
  assert.equal(out.decision, 'block');
});

test('resume without pending task does nothing', () => {
  const s = setup();
  assert.equal(run('resume', { session_id: 'none' }, envFor(s, 'new')), null);
});
