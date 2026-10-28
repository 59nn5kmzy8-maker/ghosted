#!/usr/bin/env node
// smart-compact: compact when the user switches task, then start that task.
// `prompt` runs on UserPromptSubmit, `resume` on SessionStart(compact).
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawn, spawnSync } = require('child_process');

const MIN_TOKENS = Number(process.env.SMART_COMPACT_MIN_TOKENS || 20000);
const PENDING_TTL_MS = 10 * 60 * 1000;
const RESUME_TEXT = 'Start the pending task.';
const DATA_DIR = process.env.CLAUDE_PLUGIN_DATA || path.join(os.homedir(), '.claude', 'smart-compact');

function pendingPath(sessionId) {
  return path.join(DATA_DIR, 'pending', `${String(sessionId).replace(/[^\w-]/g, '_')}.md`);
}

function readPending(sessionId) {
  const file = pendingPath(sessionId);
  try {
    if (Date.now() - fs.statSync(file).mtimeMs > PENDING_TTL_MS) { fs.rmSync(file, { force: true }); return null; }
    return { file, text: fs.readFileSync(file, 'utf8') };
  } catch { return null; }
}

// Text of the conversation since the last compaction, oldest first.
function conversationSinceCompact(transcriptPath) {
  let lines;
  try { lines = fs.readFileSync(transcriptPath, 'utf8').split('\n'); } catch { return ''; }
  // shortcut: compact_boundary marker is undocumented; if missing, whole transcript counts (judges more often, still safe).
  let start = 0;
  lines.forEach((l, i) => { if (l.includes('"subtype":"compact_boundary"')) start = i + 1; });
  const out = [];
  for (const line of lines.slice(start)) {
    let entry;
    try { entry = JSON.parse(line); } catch { continue; }
    const msg = entry.message;
    if (!msg || (entry.type !== 'user' && entry.type !== 'assistant')) continue;
    const parts = typeof msg.content === 'string' ? [{ type: 'text', text: msg.content }] : msg.content || [];
    for (const p of parts) {
      if (p.type === 'text') out.push(`${msg.role}: ${p.text}`);
      else if (p.type === 'tool_use') out.push(`tool_use: ${JSON.stringify(p.input)}`);
      else if (p.type === 'tool_result') out.push(`tool_result: ${typeof p.content === 'string' ? p.content : JSON.stringify(p.content)}`);
    }
  }
  return out.join('\n');
}

function judge(recent, prompt, sessionId) {
  const fake = process.env.SMART_COMPACT_FAKE_JUDGE;
  if (fake) return fake === 'error' ? null : { new_task: fake === 'new', focus: 'fake focus' };
  const question = [
    'You decide if a coding-assistant user just switched to a NEW, unrelated task.',
    'NEW = the earlier conversation is not needed to do the new request.',
    'SAME = follow-up, fix, tweak, question about, or continuation of the earlier work.',
    'Reply with only JSON: {"new_task": true|false, "focus": "<5-15 word summary of the new request>"}',
    '', '<recent_conversation>', recent, '</recent_conversation>',
    '', '<new_request>', prompt, '</new_request>',
  ].join('\n');
  const r = spawnSync('claude', ['-p', '--model', 'haiku', '--no-session-persistence', '--output-format', 'json', question], {
    env: { ...process.env, SMART_COMPACT_CHILD: '1' }, encoding: 'utf8', timeout: 25000, input: '',
  });
  debug('judge exit', r.status, r.error ? r.error.message : '', (r.stderr || '').slice(0, 300));
  let out;
  try { out = JSON.parse(r.stdout); } catch { return null; }
  logCost(sessionId, out.total_cost_usd);
  const m = String(out.result || '').match(/\{[\s\S]*\}/);
  if (r.status !== 0 || !m) return null;
  try { return JSON.parse(m[0]); } catch { return null; }
}

// Judge spend per session, so the cost of the plugin itself is visible.
function logCost(sessionId, usd) {
  if (typeof usd !== 'number') return;
  fs.mkdirSync(DATA_DIR, { recursive: true });
  fs.appendFileSync(path.join(DATA_DIR, 'judge-costs.jsonl'), JSON.stringify({ ts: new Date().toISOString(), session: sessionId, usd }) + '\n');
}

// tty of the terminal running Claude Code, e.g. /dev/ttys003.
function findTty() {
  let pid = process.ppid;
  for (let i = 0; i < 10 && pid > 1; i++) {
    const r = spawnSync('ps', ['-o', 'ppid=,tty=', '-p', String(pid)], { encoding: 'utf8' });
    const [ppid, tty] = (r.stdout || '').trim().split(/\s+/);
    if (tty && tty !== '??') return `/dev/${tty}`;
    pid = Number(ppid);
  }
  return null;
}

// Types keystrokes into this Claude Code input after the current hook returns.
// steps: [[delaySeconds, text], ...]. Claude Code submits on a CR that arrives on its own
// (a CR inside a burst of text counts as pasted), so callers send '\r' as a separate step.
function typeLater(steps) {
  if (process.env.SMART_COMPACT_DRY_TYPE) {
    fs.appendFileSync(process.env.SMART_COMPACT_DRY_TYPE, steps.map(s => s[1]).join('') + '\n');
    return true;
  }
  const tty = process.env.TERM_PROGRAM === 'Apple_Terminal' ? findTty() : null;
  try {
    // not detached: the helper must keep this terminal as its controlling tty for TIOCSTI
    const child = spawn('python3', [path.join(__dirname, 'type-keys.py'), JSON.stringify(steps), tty || ''], { stdio: 'ignore' });
    child.on('error', () => {});
    child.unref();
    return true;
  } catch { return false; }
}

function onPrompt(input) {
  const prompt = (input.prompt || '').trim();
  if (process.env.SMART_COMPACT_OFF || process.env.SMART_COMPACT_CHILD) return;
  // `!` is Claude Code's shell mode, so the overrides are plain-word prefixes.
  if (prompt.startsWith('/') || /^same:/i.test(prompt)) return;

  const pending = readPending(input.session_id);
  if (pending) {
    if (prompt === RESUME_TEXT) fs.rmSync(pending.file, { force: true });
    return; // mid-handoff: never judge
  }

  let verdict;
  if (/^new:/i.test(prompt)) {
    verdict = { new_task: true, focus: prompt.slice(4).trim().slice(0, 120) };
  } else {
    const recent = conversationSinceCompact(input.transcript_path);
    debug('context tokens est', Math.round(recent.length / 4));
    if (recent.length / 4 < MIN_TOKENS) return;
    verdict = judge(recent.slice(-6000), prompt.slice(0, 4000), input.session_id);
    debug('verdict', JSON.stringify(verdict));
    if (!verdict || verdict.new_task !== true) return; // fail open
  }

  fs.mkdirSync(path.dirname(pendingPath(input.session_id)), { recursive: true });
  fs.writeFileSync(pendingPath(input.session_id), input.prompt);
  const focus = String(verdict.focus || '').replace(/\s+/g, ' ').slice(0, 200);
  // Claude Code puts a blocked prompt back in the input; Ctrl-C clears it before /compact.
  // The first CR can be taken by the slash-command menu; a second CR on an empty input does nothing.
  const typed = typeLater([[0.7, '\x03'], [0.4, `/compact Keep only what helps with the next task: ${focus}`], [0.8, '\r'], [0.8, '\r']]);
  const reason = typed
    ? 'smart-compact: new task detected, compacting first. Your task will start automatically.'
    : 'smart-compact: new task detected. Run /compact, then type "go". Your task is saved and will be restored.';
  process.stdout.write(JSON.stringify({ decision: 'block', reason }));
}

function onResume(input) {
  const pending = readPending(input.session_id);
  if (!pending) return;
  process.stdout.write(JSON.stringify({
    hookSpecificOutput: {
      hookEventName: 'SessionStart',
      additionalContext: `smart-compact compacted the context because the user started a new task. The user's next task (verbatim), to start on their next message:\n\n${pending.text}`,
    },
  }));
  typeLater([[1.0, RESUME_TEXT], [0.5, '\r']]);
}

function debug(...a) {
  if (!process.env.SMART_COMPACT_DEBUG) return;
  fs.mkdirSync(DATA_DIR, { recursive: true });
  fs.appendFileSync(path.join(DATA_DIR, 'debug.log'), `${new Date().toISOString()} ${a.join(' ')}\n`);
}

function main() {
  let input = {};
  try { input = JSON.parse(fs.readFileSync(0, 'utf8') || '{}'); } catch {}
  debug(process.argv[2], JSON.stringify({ ...input, prompt: (input.prompt || '').slice(0, 60) }));
  try {
    if (process.argv[2] === 'prompt') onPrompt(input);
    else if (process.argv[2] === 'resume') onResume(input);
  } catch (e) {
    process.stderr.write(`smart-compact: ${e.message}\n`); // never block the user on our own bug
  }
}

main();
