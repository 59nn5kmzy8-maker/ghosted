const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawn, spawnSync } = require('child_process');

const SCRIPT = path.join(__dirname, '..', 'hooks', 'ghosted.js');

function setup() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ghosted-'));
  const transcript = path.join(dir, 't.jsonl');
  const big = 'x'.repeat(100000);
  fs.writeFileSync(transcript, [
    JSON.stringify({ type: 'user', message: { role: 'user', content: 'old task ' + big } }),
    JSON.stringify({ type: 'assistant', message: { role: 'assistant', content: [{ type: 'text', text: 'done' }] } }),
  ].join('\n'));
  return { dir, transcript, typed: path.join(dir, 'typed.txt'), cwd: path.join(dir, 'project') };
}

function run(mode, input, env, args = []) {
  const r = spawnSync(process.execPath, [SCRIPT, mode, ...args], {
    input: JSON.stringify(input), encoding: 'utf8',
    env: { ...process.env, GHOSTED_CHILD: '', GHOSTED_OFF: '', GHOSTED_MODE: '', GHOSTED_MAX_CONTEXT: '', GHOSTED_TERSE: 'off', ...env },
  });
  return !r.stdout ? null : mode === 'recall' ? r.stdout : JSON.parse(r.stdout);
}

// typed keystrokes per hook call, as plain text, one line per call
function typedText(s) {
  return fs.readFileSync(s.typed, 'utf8').trim().split('\n').map(l => JSON.parse(l).map(x => x[1]).join(''));
}

function envFor(s, judge) {
  return { CLAUDE_PLUGIN_DATA: s.dir, GHOSTED_DRY_TYPE: s.typed, GHOSTED_FAKE_JUDGE: judge };
}

const pendingFiles = s => (fs.existsSync(path.join(s.dir, 'pending')) ? fs.readdirSync(path.join(s.dir, 'pending')) : []);

test('new task: blocks, archives, types /compact; resume injects task and archive path, types go', () => {
  const s = setup();
  const input = { session_id: 'abc', cwd: s.cwd, transcript_path: s.transcript, prompt: 'build a new login page' };
  const env = { ...envFor(s, 'new'), GHOSTED_MODE: 'compact' };
  const out = run('prompt', input, env);
  assert.equal(out.decision, 'block');
  assert.equal(pendingFiles(s).length, 1);
  assert.equal(typedText(s)[0], '\x03/compact Keep only what helps with the next task: fake focus. Write the summary as terse notes: no filler, keep paths, names, numbers and decisions exact.\r\r');
  const archives = fs.readdirSync(path.join(s.dir, 'archive')).filter(f => f.endsWith('.md'));
  assert.equal(archives.length, 1);
  assert.match(fs.readFileSync(path.join(s.dir, 'archive', archives[0]), 'utf8'), /task: fake old task[\s\S]*user: old task x/);

  // /compact keeps the session id, /clear makes a new one: the pending task is found by cwd either way
  const res = run('resume', { session_id: 'new-session-after-clear', cwd: s.cwd }, env);
  const ctx = res.hookSpecificOutput.additionalContext;
  assert.match(ctx, /build a new login page/);
  assert.ok(ctx.includes(archives[0]));
  assert.equal(typedText(s)[1], 'Start the pending task.\r');

  // the typed resume message passes and clears the pending task
  assert.equal(run('prompt', { ...input, prompt: 'Start the pending task.' }, env), null);
  assert.equal(pendingFiles(s).length, 0);
});

test('clear is the default: types /clear and says so on resume', () => {
  const s = setup();
  const env = envFor(s, 'new');
  const input = { session_id: 'abc', cwd: s.cwd, transcript_path: s.transcript, prompt: 'write a brand new readme for the docs folder' };
  assert.equal(run('prompt', input, env).decision, 'block');
  assert.equal(typedText(s)[0], '\x03/clear\r\r');
  assert.match(run('resume', { session_id: 'x', cwd: s.cwd }, env).hookSpecificOutput.additionalContext, /freed the context \(clear\)/);
});

test('a skill command with a request is judged; after the clear it is retyped once, not judged again', () => {
  const s = setup();
  const env = envFor(s, 'new');
  const cmd = '/claude-seo:seo-audit example.com and write a new hero line';
  const input = { session_id: 'abc', cwd: s.cwd, transcript_path: s.transcript, prompt: cmd };
  assert.equal(run('prompt', input, env).decision, 'block');
  for (const own of ['/compact keep the plan', '/model opus', '/ghosted:ghosted-stats', '/review']) {
    assert.equal(run('prompt', { ...input, prompt: own }, envFor(s, 'new')), null, own);
  }
  run('resume', { session_id: 'x', cwd: s.cwd }, env);
  assert.equal(typedText(s)[1], cmd + '\r\r');
  assert.equal(run('prompt', input, env), null); // the retyped command passes
  assert.equal(run('prompt', input, env).decision, 'block'); // only once
});

test('screenshots in tool results do not count as context', () => {
  const s = setup();
  const img = { type: 'image', source: { type: 'base64', media_type: 'image/png', data: 'A'.repeat(400000) } };
  fs.writeFileSync(s.transcript, [
    JSON.stringify({ type: 'user', message: { role: 'user', content: 'take a screenshot' } }),
    JSON.stringify({ type: 'user', message: { role: 'user', content: [{ type: 'tool_result', content: [img] }] } }),
  ].join('\n'));
  const input = { session_id: 'abc', cwd: s.cwd, transcript_path: s.transcript, prompt: 'build a new login page' };
  assert.equal(run('prompt', input, envFor(s, 'new')), null); // tiny real context: never judged
});

test('passes through: same task, judge error, slash, same:, small context, child', () => {
  const s = setup();
  const input = { session_id: 'abc', cwd: s.cwd, transcript_path: s.transcript, prompt: 'tweak it' };
  assert.equal(run('prompt', input, envFor(s, 'same')), null);
  assert.equal(run('prompt', input, envFor(s, 'error')), null);
  assert.equal(run('prompt', { ...input, prompt: '/compact' }, envFor(s, 'new')), null);
  assert.equal(run('prompt', { ...input, prompt: 'same: do x' }, envFor(s, 'new')), null);
  assert.equal(run('prompt', input, { ...envFor(s, 'new'), GHOSTED_MIN_TOKENS: '999999' }), null);
  assert.equal(run('prompt', input, { ...envFor(s, 'new'), GHOSTED_CHILD: '1' }), null);
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

test('recall finds an archived conversation and shows a digest without tool output', () => {
  const s = setup();
  fs.appendFileSync(s.transcript, '\n' + JSON.stringify({ type: 'user', message: { role: 'user', content: [{ type: 'tool_result', content: 'SECRET-TOOL-OUTPUT' }] } }));
  run('prompt', { session_id: 'abc', cwd: s.cwd, transcript_path: s.transcript, prompt: 'new: other thing' }, envFor(s, 'error'));
  const out = run('recall', {}, envFor(s, 'new'), [s.dir, 'old', 'task']);
  assert.match(out, /Matches/);
  assert.match(out, /user: old task x/);
  assert.ok(!out.includes('SECRET-TOOL-OUTPUT'));
  assert.match(run('recall', {}, envFor(s, 'new'), [s.dir, 'zzzqqq']), /no archived conversation matches/);
  // words on stdin (how the skill passes them), shell metacharacters stay plain text; a broken index line is skipped
  fs.appendFileSync(path.join(s.dir, 'archive', 'index.jsonl'), '{"half-writ');
  const r = spawnSync(process.execPath, [SCRIPT, 'recall', s.dir], { input: "what's old task; $(rm -rf x)", encoding: 'utf8' });
  assert.match(r.stdout, /Matches/);
});

function withUsage(s, tokens) {
  fs.appendFileSync(s.transcript, '\n' + JSON.stringify({ type: 'assistant', message: { role: 'assistant', content: [{ type: 'tool_use', input: {} }],
    usage: { input_tokens: 10, cache_read_input_tokens: tokens - 10, cache_creation_input_tokens: 0 } } }));
}

test('mid-run: over the limit stops, types /compact, and resumes with "Continue where you left off."', () => {
  const s = setup();
  const env = { ...envFor(s, 'new'), GHOSTED_MAX_CONTEXT: '250000' };
  const input = { session_id: 'abc', cwd: s.cwd, transcript_path: s.transcript };
  withUsage(s, 200000);
  assert.equal(run('tool', input, env), null);
  withUsage(s, 260000);
  const out = run('tool', input, env);
  assert.equal(out.continue, false);
  assert.match(out.stopReason, /260k \(limit 250k\)/);
  assert.match(typedText(s)[0], /^\/compact Context limit reached mid-task/);
  assert.equal(run('tool', input, env), null); // pending: no second stop while compacting
  const ctx = run('resume', { session_id: 'abc', cwd: s.cwd }, env).hookSpecificOutput.additionalContext;
  assert.match(ctx, /continue the task you were doing/);
  assert.equal(typedText(s)[1], 'Continue where you left off.\r');
  assert.equal(run('prompt', { ...input, prompt: 'Continue where you left off.' }, env), null);
  assert.equal(pendingFiles(s).length, 0);
  fs.appendFileSync(s.transcript, '\n' + JSON.stringify({ type: 'system', subtype: 'compact_boundary' }));
  assert.equal(run('tool', input, env), null); // old usage before the boundary no longer counts
  assert.equal(run('tool', input, { ...env, GHOSTED_MAX_CONTEXT: '0' }), null);
});

test('terse mode: auto is full, but steps aside when caveman is active; off adds nothing', () => {
  const s = setup();
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'ghosted-home-'));
  const auto = { ...envFor(s, 'new'), GHOSTED_TERSE: '', HOME: home, USERPROFILE: home };
  assert.match(run('start', {}, auto).hookSpecificOutput.additionalContext, /terse mode \(full\)/);
  fs.mkdirSync(path.join(home, '.claude'));
  fs.writeFileSync(path.join(home, '.claude', 'settings.json'), JSON.stringify({ hooks: { SessionStart: [{ hooks: [{ type: 'command', command: '/x/caveman-proxy native-hook' }] }] } }));
  assert.equal(run('start', {}, auto), null);
  assert.equal(run('start', {}, { ...envFor(s, 'new'), GHOSTED_TERSE: 'off' }), null);
  assert.match(run('start', {}, { ...envFor(s, 'new'), GHOSTED_TERSE: 'lite' }).hookSpecificOutput.additionalContext, /terse mode \(lite\)/);
  assert.match(run('start', {}, { ...envFor(s, 'new'), GHOSTED_TERSE: 'full' }).hookSpecificOutput.additionalContext, /drop articles/i);
  assert.equal(run('start', {}, { ...envFor(s, 'new'), GHOSTED_TERSE: 'off' }), null);
});

test('obvious follow-ups skip the judge', () => {
  const s = setup();
  const input = { session_id: 'abc', cwd: s.cwd, transcript_path: s.transcript };
  for (const prompt of ['ok', 'yes do it', 'also add a docstring to every function please', 'fix it and run the tests again',
    'update that file so the parser handles empty input too', 'apply the same pattern to the other two modules'])
    assert.equal(run('prompt', { ...input, prompt }, envFor(s, 'new')), null, prompt);
  assert.equal(run('prompt', { ...input, prompt: 'build a small web server that serves static files' }, envFor(s, 'new')).decision, 'block');
});

test('settings accept 250k, unreadable values fall back to the default', () => {
  const s = setup();
  const input = { session_id: 'abc', cwd: s.cwd, transcript_path: s.transcript };
  withUsage(s, 260000);
  assert.equal(run('tool', input, { ...envFor(s, 'new'), CLAUDE_PLUGIN_OPTION_max_context: '250k' }).continue, false);
  const t = setup();
  assert.equal(run('prompt', { session_id: 'a', cwd: t.cwd, transcript_path: t.transcript, prompt: 'build a small web server for static files' },
    { ...envFor(t, 'new'), GHOSTED_MIN_TOKENS: 'lots' }).decision, 'block'); // 'lots' -> default 20000, transcript is ~25k
});

test('resume consumes the pending task once and finds it from another folder', () => {
  const s = setup();
  run('prompt', { session_id: 'abc', cwd: s.cwd, transcript_path: s.transcript, prompt: 'new: write the docs' }, envFor(s, 'error'));
  const res = run('resume', { session_id: 'x', cwd: path.join(s.cwd, 'sub') }, envFor(s, 'new'));
  assert.match(res.hookSpecificOutput.additionalContext, /write the docs/);
  assert.equal(pendingFiles(s).length, 0);
  assert.equal(run('resume', { session_id: 'y', cwd: s.cwd }, envFor(s, 'new')), null); // a later /clear injects nothing
});

test('archives and pending files are private', { skip: process.platform === 'win32' }, () => {
  const s = setup();
  run('prompt', { session_id: 'abc', cwd: s.cwd, transcript_path: s.transcript, prompt: 'new: write the docs' }, envFor(s, 'error'));
  const dir = path.join(s.dir, 'archive');
  assert.equal(fs.statSync(dir).mode & 0o777, 0o700);
  for (const f of fs.readdirSync(dir)) assert.equal(fs.statSync(path.join(dir, f)).mode & 0o777, 0o600, f);
});

test('terse mode adds a one-line reminder to prompts that pass, not to blocked ones', () => {
  const s = setup();
  const env = { ...envFor(s, 'same'), GHOSTED_TERSE: 'full' };
  const input = { session_id: 'abc', cwd: s.cwd, transcript_path: s.transcript, prompt: 'tweak the parser a bit more please' };
  assert.match(run('prompt', input, env).hookSpecificOutput.additionalContext, /compressed notes/);
  assert.equal(run('prompt', { ...input, prompt: 'new: write docs' }, env).decision, 'block');
});

test('/ghosted command: terse level, max, pause, stats, help', () => {
  const s = setup();
  const cmd = (...a) => spawnSync(process.execPath, [SCRIPT, 'cmd', s.dir, ...a], { encoding: 'utf8', env: { ...process.env, GHOSTED_TERSE: '' } }).stdout;
  assert.match(cmd('lite'), /terse: lite/);
  const env = { ...envFor(s, 'new'), GHOSTED_TERSE: '' };
  assert.match(run('start', {}, env).hookSpecificOutput.additionalContext, /terse mode \(lite\)/); // override beats the default
  assert.match(cmd('max', '250k'), /250,000 tokens/);
  const input = { session_id: 'abc', cwd: s.cwd, transcript_path: s.transcript };
  withUsage(s, 260000);
  assert.equal(run('tool', input, env).continue, false);
  assert.match(cmd('pause'), /paused/);
  assert.equal(run('start', {}, env), null);
  assert.match(cmd('stats'), /mid-run compactions  1[\s\S]*PAUSED/);
  assert.match(cmd('reset'), /cleared/);
  assert.match(cmd(), /\/ghosted-stats[\s\S]*\/ghosted-off/);
  assert.match(cmd("help"), /\/ghosted full \| lite/);
  // arguments on stdin, as the skill passes them
  assert.match(spawnSync(process.execPath, [SCRIPT, 'cmd', s.dir], { input: 'full\n', encoding: 'utf8' }).stdout, /terse: full/);
});

test('/ghosted warm sets the keep-warm window; stats shows it', () => {
  const s = setup();
  const cmd = (...a) => spawnSync(process.execPath, [SCRIPT, 'cmd', s.dir, ...a], { encoding: 'utf8', env: { ...process.env, GHOSTED_KEEP_WARM: '' } }).stdout;
  assert.match(cmd('warm', '90m'), /up to 90 minutes/);
  assert.match(cmd('stats'), /warm 90m/);
  assert.match(cmd('warm', 'off'), /warming off/);
  assert.match(cmd('stats'), /warm off/);
  assert.match(cmd('warm', 'soon'), /Usage/);
});

test('stop: starts one warmer per session above the threshold, none when off or small', async () => {
  const s = setup();
  const usage = n => JSON.stringify({ type: 'assistant', message: { role: 'assistant', model: 'claude-test', content: [], usage: { input_tokens: 0, cache_read_input_tokens: n, cache_creation_input_tokens: 0 } } });
  const input = { session_id: 'warm1', cwd: s.cwd, transcript_path: s.transcript };
  const pidFile = path.join(s.dir, 'warm', 'warm1.pid');
  const env = { CLAUDE_PLUGIN_DATA: s.dir, GHOSTED_WARM_EVERY_S: '3600', GHOSTED_KEEP_WARM: '' };
  fs.writeFileSync(s.transcript, usage(5000) + '\n');
  run('stop', input, env);
  assert.ok(!fs.existsSync(pidFile), 'small context: no warmer');
  fs.writeFileSync(s.transcript, usage(150000) + '\n');
  run('stop', input, { ...env, GHOSTED_KEEP_WARM: 'off' });
  assert.ok(!fs.existsSync(pidFile), 'off: no warmer');
  run('stop', input, env);
  const warmerPid = () => JSON.parse(fs.readFileSync(pidFile, 'utf8')).pid;
  const first = warmerPid();
  run('stop', input, env); // the next turn replaces the warmer
  const second = warmerPid();
  assert.notEqual(first, second);
  await new Promise(r => setTimeout(r, 500));
  assert.throws(() => process.kill(first, 0), 'old warmer stopped');
  process.kill(second, 'SIGTERM');
});

test('a stale warmer pid file never signals a process that is not a warmer', () => {
  const s = setup();
  const usage = JSON.stringify({ type: 'assistant', message: { role: 'assistant', content: [], usage: { cache_read_input_tokens: 150000 } } });
  fs.writeFileSync(s.transcript, usage + '\n');
  const bystander = spawn(process.execPath, ['-e', 'setTimeout(() => {}, 30000)'], { stdio: 'ignore' });
  fs.mkdirSync(path.join(s.dir, 'warm'), { recursive: true });
  fs.writeFileSync(path.join(s.dir, 'warm', 'w2.pid'), String(bystander.pid)); // old format, reused pid
  run('stop', { session_id: 'w2', cwd: s.cwd, transcript_path: s.transcript }, { CLAUDE_PLUGIN_DATA: s.dir, GHOSTED_WARM_EVERY_S: '3600' });
  assert.doesNotThrow(() => process.kill(bystander.pid, 0), 'bystander still alive');
  bystander.kill();
  process.kill(JSON.parse(fs.readFileSync(path.join(s.dir, 'warm', 'w2.pid'), 'utf8')).pid, 'SIGTERM');
});

test('a task switch stops the old session warmer; so does a clear in the same Claude Code', async () => {
  const s = setup();
  const env = { ...envFor(s, 'new'), CLAUDE_PID: String(process.pid), GHOSTED_WARM_EVERY_S: '3600' };
  const startWarmer = id => {
    fs.appendFileSync(s.transcript, '\n' + JSON.stringify({ type: 'assistant', message: { role: 'assistant', content: [], usage: { cache_read_input_tokens: 150000 } } }));
    run('stop', { session_id: id, cwd: s.cwd, transcript_path: s.transcript }, env);
    return JSON.parse(fs.readFileSync(path.join(s.dir, 'warm', `${id}.pid`), 'utf8')).pid;
  };
  const gone = async pid => { await new Promise(r => setTimeout(r, 500)); assert.throws(() => process.kill(pid, 0)); };
  const a = startWarmer('sa');
  assert.equal(run('prompt', { session_id: 'sa', cwd: s.cwd, transcript_path: s.transcript, prompt: 'build a small web server that serves static files' }, env).decision, 'block');
  await gone(a);
  run('resume', { session_id: 'sb', cwd: s.cwd, source: 'clear' }, env);
  const b = startWarmer('sb');
  run('resume', { session_id: 'sc', cwd: s.cwd, source: 'clear' }, env); // a manual /clear
  await gone(b);
});

test('injected messages and one-word skill requests', () => {
  const s = setup();
  const input = { session_id: 'abc', cwd: s.cwd, transcript_path: s.transcript };
  for (const prompt of ['<task-notification>\nAgent result: built a static server in main.go\n</task-notification>', '<agent-message from="x">done: wrote the parser</agent-message>'])
    assert.equal(run('prompt', { ...input, prompt }, envFor(s, 'new')), null, prompt);
  assert.equal(run('prompt', { ...input, prompt: '/claude-seo:seo-audit example.com' }, envFor(s, 'new')).decision, 'block');
});

test('resume only takes a pending task from another folder when the same Claude Code wrote it', () => {
  const s = setup();
  const input = { session_id: 'abc', cwd: s.cwd, transcript_path: s.transcript, prompt: 'build a new login page' };
  run('prompt', input, { ...envFor(s, 'new'), CLAUDE_PID: '111' });
  assert.equal(run('resume', { session_id: 'x', cwd: path.join(s.dir, 'other') }, { ...envFor(s, 'new'), CLAUDE_PID: '222' }), null);
  assert.match(run('resume', { session_id: 'y', cwd: path.join(s.dir, 'other') }, { ...envFor(s, 'new'), CLAUDE_PID: '111' }).hookSpecificOutput.additionalContext, /login page/);
});

test('GHOSTED_OFF=0 does not pause', () => {
  const s = setup();
  const out = spawnSync(process.execPath, [SCRIPT, 'cmd', s.dir, 'status'], { input: '', encoding: 'utf8', env: { ...process.env, GHOSTED_OFF: '0' } }).stdout;
  assert.match(out, /^ghosted_ on/);
});

test('/ghosted-stats starts a local dashboard that needs its token', async () => {
  const s = setup();
  fs.writeFileSync(path.join(s.dir, 'events.jsonl'), JSON.stringify({ ts: new Date().toISOString(), kind: 'switch', tokens: 150000, old: 'auth', focus: 'dark mode' }) + '\n');
  const env = { ...process.env, GHOSTED_NO_OPEN: '1' };
  const out = spawnSync(process.execPath, [SCRIPT, 'cmd', s.dir, 'dashboard'], { encoding: 'utf8', input: '', env }).stdout;
  const url = (out.match(/http:\/\/127\.0\.0\.1:\d+\/\?t=\w+/) || [])[0];
  assert.ok(url, out);
  const info = JSON.parse(fs.readFileSync(path.join(s.dir, 'dashboard.json'), 'utf8'));
  try {
    const api = await (await fetch(url.replace('/?', '/api/stats?'))).json();
    assert.equal(api.events[0].tokens, 150000);
    assert.equal((await fetch(url.replace(/t=\w+/, 't=wrong'))).status, 403);
    // a second call reuses the running dashboard
    const again = spawnSync(process.execPath, [SCRIPT, 'cmd', s.dir, 'dashboard'], { encoding: 'utf8', input: '', env }).stdout;
    assert.ok(again.includes(url));
  } finally {
    process.kill(info.pid);
  }
});
