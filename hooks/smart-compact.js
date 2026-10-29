#!/usr/bin/env node
// smart-compact: when the user switches task, free the context (/compact or /clear), then start that task.
// It also compacts mid-run when the context passes a limit, then lets the run continue.
// `prompt` runs on UserPromptSubmit, `tool` on PostToolUse, `resume` on SessionStart(compact|clear),
// `start` on every SessionStart (terse mode), `recall <data dir> [words]` from the recall skill.
const fs = require('fs');
const os = require('os');
const path = require('path');
const crypto = require('crypto');
const { spawn, spawnSync } = require('child_process');

// Settings: an env var wins, then the value the user picked in the plugin's config (/config), then the default.
const opt = (env, key, dflt) => process.env[env] || process.env[`CLAUDE_PLUGIN_OPTION_${key}`]
  || process.env[`CLAUDE_PLUGIN_OPTION_${key.toLowerCase()}`] || dflt;
// Token counts: 250000, 250k or 1m. Anything unreadable falls back to the default instead of silently disabling a check.
function tokens(v, dflt) {
  const m = String(v).trim().match(/^(\d+(?:\.\d+)?)\s*([km]?)$/i);
  return m ? Math.round(m[1] * { '': 1, k: 1e3, m: 1e6 }[m[2].toLowerCase()]) : dflt;
}
const MIN_TOKENS = tokens(opt('SMART_COMPACT_MIN_TOKENS', 'SWITCH_MIN_TOKENS', 20000), 20000);
const MAX_RAW = tokens(opt('SMART_COMPACT_MAX_CONTEXT', 'MAX_CONTEXT', 0), 0); // 0 = no mid-run compaction
// Below ~100k, Claude Code's fixed overhead plus the summary could keep it over the limit and compact on every tool call.
const MAX_CONTEXT = MAX_RAW > 0 ? Math.max(MAX_RAW, 100000) : 0;
const TERSE = opt('SMART_COMPACT_TERSE', 'TERSE', 'lite');
const MODE = process.env.SMART_COMPACT_MODE === 'compact' ? 'compact' : 'clear';
const PENDING_TTL_MS = 10 * 60 * 1000;
const RESUME_TEXT = 'Start the pending task.';
const CONTINUE_TEXT = 'Continue where you left off.';
const TERSE_SUMMARY = 'Write the summary as terse notes: no filler, keep paths, names, numbers and decisions exact.';
// The recall skill runs through the Bash tool, which has no CLAUDE_PLUGIN_DATA, so it passes the dir as an argument.
const DATA_DIR = (process.argv[2] === 'recall' && process.argv[3]) || process.env.CLAUDE_PLUGIN_DATA
  || path.join(os.homedir(), '.claude', 'smart-compact');
const WIN = process.platform === 'win32';

// Keyed by working directory, not session: /clear starts a new session id.
// shortcut: two sessions switching task in the same folder within seconds would share it; key by terminal if that happens.
function pendingPath(cwd) {
  const key = crypto.createHash('sha1').update(String(cwd || '')).digest('hex').slice(0, 16);
  return path.join(DATA_DIR, 'pending', `${key}.json`);
}

// Private files: archives and pending tasks can hold secrets from tool output.
const PRIVATE = { mode: 0o600 };
function privateDir(dir) { fs.mkdirSync(dir, { recursive: true, mode: 0o700 }); return dir; }

// wx: fail if one exists, so parallel tool calls (or two sessions in one folder) start only one handoff.
function writePending(cwd, data) {
  privateDir(path.dirname(pendingPath(cwd)));
  try { fs.writeFileSync(pendingPath(cwd), JSON.stringify(data), { ...PRIVATE, flag: 'wx' }); return true; } catch { return false; }
}

// anyCwd: after /clear the new session may start in another folder (Claude cd'd during the old task),
// so resume also accepts the newest fresh pending file.
function readPending(cwd, anyCwd = false) {
  let file = pendingPath(cwd);
  if (anyCwd && !fs.existsSync(file)) {
    const dir = path.dirname(file);
    let names = [];
    try { names = fs.readdirSync(dir).filter(n => n.endsWith('.json')); } catch {}
    const newest = names.map(n => path.join(dir, n)).sort((a, b) => fs.statSync(b).mtimeMs - fs.statSync(a).mtimeMs)[0];
    if (newest) file = newest;
  }
  try {
    if (Date.now() - fs.statSync(file).mtimeMs > PENDING_TTL_MS) { fs.rmSync(file, { force: true }); return null; }
    return { file, ...JSON.parse(fs.readFileSync(file, 'utf8')) };
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

// Real context size in tokens, from the API usage of the last reply since the last compaction (null if none yet).
// Reads only the end of the transcript: this runs after every tool call.
function contextTokens(transcriptPath) {
  let text;
  try {
    const fd = fs.openSync(transcriptPath, 'r');
    const size = fs.fstatSync(fd).size, len = Math.min(size, 512 * 1024);
    const buf = Buffer.alloc(len);
    fs.readSync(fd, buf, 0, len, size - len);
    fs.closeSync(fd);
    text = buf.toString('utf8');
  } catch { return null; }
  const lines = text.split('\n');
  for (let i = lines.length - 1; i >= 0; i--) {
    if (lines[i].includes('"subtype":"compact_boundary"')) return null;
    if (!lines[i].includes('"usage"') || lines[i].includes('"isSidechain":true')) continue;
    let u;
    try { u = JSON.parse(lines[i]).message.usage; } catch { continue; }
    if (u) return (u.input_tokens || 0) + (u.cache_read_input_tokens || 0) + (u.cache_creation_input_tokens || 0);
  }
  return null;
}

// Runs the `claude` CLI with the prompt on stdin (no argv quoting or size limits, works the same on Windows).
function claudeCli(args, input) {
  return spawnSync('claude', args, {
    env: { ...process.env, SMART_COMPACT_CHILD: '1' }, encoding: 'utf8', timeout: 25000, input,
    shell: WIN, windowsHide: true,
  });
}

function judge(head, recent, prompt, sessionId) {
  const fake = process.env.SMART_COMPACT_FAKE_JUDGE;
  if (fake) return fake === 'error' ? null : { new_task: fake === 'new', focus: 'fake focus', old_task: 'fake old task', carry: '' };
  const question = [
    'You decide if a coding-assistant user just switched to a NEW, unrelated task.',
    'NEW = the earlier conversation is not needed to do the new request.',
    'SAME = follow-up, fix, tweak, question about, or continuation of the earlier work.',
    'Also SAME when the new request refers back to the earlier conversation ("you already read", "those", "above", "that file", "it")',
    'or needs anything only that conversation holds. Clearing then loses what the user is pointing at. If unsure, answer SAME.',
    'Reply with only JSON:',
    '{"new_task": true|false, "focus": "<5-15 word summary of the new request>",',
    ' "old_task": "<5-20 word summary of the earlier work>",',
    ' "carry": "<only if new_task: up to 5 terse note-style lines (no filler words) of facts from the earlier conversation the new request still needs (paths, names, decisions); empty string if none>"}',
    '', '<conversation_start>', head, '</conversation_start>',
    '', '<recent_conversation>', recent, '</recent_conversation>',
    '', '<new_request>', prompt, '</new_request>',
  ].join('\n');
  // Keep the judge lean: no user settings/hooks/plugins/MCP/tools in its context (about 15x cheaper, ~2s faster).
  const r = claudeCli(['-p', '--model', 'haiku', '--no-session-persistence', '--output-format', 'json',
    '--setting-sources=', '--strict-mcp-config', '--tools=', '--disable-slash-commands'], question);
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

// Compaction is lossy: keep the old conversation byte-exact on disk and list it in index.jsonl,
// so `recall` finds it again from any later session.
function archive(conversation, input, oldTask) {
  if (process.env.SMART_COMPACT_ARCHIVE === '0') return null;
  const dir = privateDir(path.join(DATA_DIR, 'archive'));
  const ts = new Date().toISOString();
  const file = path.join(dir, `${ts.replace(/[:.]/g, '-')}-${String(input.session_id).slice(0, 8)}.md`);
  fs.writeFileSync(file, `# smart-compact archive\ncwd: ${input.cwd}\nsession: ${input.session_id}\ntask: ${oldTask}\n\n${conversation}\n`, PRIVATE);
  fs.appendFileSync(path.join(dir, 'index.jsonl'), JSON.stringify({ ts, cwd: input.cwd, task: oldTask, file }) + '\n', PRIVATE);
  return file;
}

// The archive minus tool calls and tool output, each message cut short: the gist at a fraction of the tokens.
function digest(text, max = 6000) {
  const blocks = text.split(/\n(?=(?:user|assistant|tool_use|tool_result): )/);
  const out = [];
  for (const b of blocks) {
    const m = b.match(/^(user|assistant): ([\s\S]*)/);
    if (!m) continue;
    const body = m[2].replace(/\s+/g, ' ').trim();
    out.push(`${m[1]}: ${body.length > 400 ? body.slice(0, 400) + '…' : body}`);
  }
  const s = out.join('\n');
  return s.length > max ? '…' + s.slice(-max) : s; // the end holds the latest state
}

// recall <words>: archives ranked by how many of the words appear in their task, folder and text.
function recall(words) {
  const terms = words.join(' ').toLowerCase().split(/\W+/).filter(w => w.length > 2);
  let rows = [];
  try {
    for (const l of fs.readFileSync(path.join(DATA_DIR, 'archive', 'index.jsonl'), 'utf8').split('\n')) {
      try { rows.push(JSON.parse(l)); } catch {} // a half-written line must not hide the rest
    }
  } catch {}
  const scored = rows.map(r => {
    let text = '';
    try { text = fs.readFileSync(r.file, 'utf8'); } catch { return null; }
    const hay = `${r.task} ${r.cwd} ${text}`.toLowerCase();
    return { ...r, text, score: terms.filter(t => hay.includes(t)).length + (terms.length ? 0 : 1) };
  }).filter(r => r && r.score > 0).sort((a, b) => b.score - a.score || b.ts.localeCompare(a.ts));
  if (!scored.length) return 'smart-compact recall: no archived conversation matches.';
  const top = scored[0];
  return [
    'Matches (best first):',
    ...scored.slice(0, 5).map(r => `- ${r.ts.slice(0, 16)} ${r.cwd}: ${r.task} (${r.file})`),
    '', `Digest of the best match (user and assistant messages only; Read the file for full detail):`, digest(top.text),
  ].join('\n');
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

const MAC_TYPE = `on run argv
  set theTty to item 1 of argv
  tell application "Terminal"
    repeat with w in windows
      repeat with t in tabs of w
        if tty of t is theTty then
          repeat with i from 2 to (count of argv) by 2
            delay ((item i of argv) as real)
            do script (item (i + 1) of argv) in t
          end repeat
          return
        end if
      end repeat
    end repeat
  end tell
end run`;

const MAC_FIND = `on run argv
  tell application "Terminal"
    repeat with w in windows
      repeat with t in tabs of w
        if tty of t is (item 1 of argv) then return "ok"
      end repeat
    end repeat
  end tell
  return "none"
end run`;

// Types keystrokes into this Claude Code session after the current hook returns.
// steps: [[delaySeconds, text], ...]. Claude Code submits on a CR that arrives on its own
// (a CR inside a burst of text counts as pasted), so callers send '\r' as a separate step.
// Hooks have no controlling terminal, so this goes through the terminal app (macOS) or the console API (Windows).
// shortcut: macOS Terminal.app and Windows consoles only; add tmux send-keys / iTerm "write text" when used.
function typeLater(steps) {
  if (process.env.SMART_COMPACT_DRY_TYPE) {
    fs.appendFileSync(process.env.SMART_COMPACT_DRY_TYPE, JSON.stringify(steps) + '\n'); // one JSON line per call
    return true;
  }
  let child;
  if (WIN) {
    // the helper attaches to the console of Claude Code (an ancestor of this hook) and writes key events into it
    child = spawn('powershell.exe', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', path.join(__dirname, 'type-keys.ps1'),
      '-Steps', Buffer.from(JSON.stringify(steps)).toString('base64'), '-Pids', ancestorPids().join(',')], { detached: true, stdio: 'ignore', windowsHide: true });
  } else {
    const tty = process.env.TERM_PROGRAM === 'Apple_Terminal' ? findTty() : null;
    // Check first that the tab is there and Terminal may be scripted: otherwise say so instead of promising typing.
    if (!tty || spawnSync('osascript', ['-e', MAC_FIND, tty], { encoding: 'utf8', timeout: 3000 }).stdout?.trim() !== 'ok') return false;
    child = spawn('osascript', ['-e', MAC_TYPE, tty, ...steps.flatMap(([d, t]) => [String(d), t])], { detached: true, stdio: 'ignore' });
  }
  child.on('error', () => {});
  child.unref();
  return true;
}

// Windows: this hook's ancestors, nearest first (the shell, then Claude Code itself).
function ancestorPids() {
  const r = spawnSync('powershell.exe', ['-NoProfile', '-Command',
    `$p=${process.pid}; $o=@(); for($i=0;$i -lt 8;$i++){ $x=Get-CimInstance Win32_Process -Filter "ProcessId=$p"; if(-not $x){break}; $p=$x.ParentProcessId; if($p -le 4){break}; $o+=$p }; $o -join ','`],
  { encoding: 'utf8', windowsHide: true, timeout: 10000 });
  return (r.stdout || '').trim().split(',').filter(Boolean);
}

// Prompts that can only continue the current work: short replies, continuation words, back-references.
// Erring towards "same" is safe: the worst case is the old behaviour (no switch).
function obviousFollowUp(prompt) {
  if (prompt.split(/\s+/).filter(Boolean).length <= 2) return true;
  if (/^(ok(ay)?|yes|yep|no|nope|sure|thanks|thank you|great|nice|perfect|continue|go on|go ahead|do it|also|again|retry|try again|fix (it|that|this))\b/i.test(prompt)) return true;
  return /\b(you (already|just)|what you (saw|read|found|wrote|did)|based on (that|this|what|your)|your (analysis|summary|comparison|overview|answer|code)|as (before|above)|above|earlier|previous(ly)?|that (file|function|change|one|error|bug)|those|the same)\b/i.test(prompt);
}

function onPrompt(input) {
  const prompt = (input.prompt || '').trim();
  if (process.env.SMART_COMPACT_OFF || process.env.SMART_COMPACT_CHILD) return;
  // `!` is Claude Code's shell mode, so the overrides are plain-word prefixes.
  if (prompt.startsWith('/') || /^same:/i.test(prompt) || prompt === RESUME_TEXT || prompt === CONTINUE_TEXT) return;

  if (readPending(input.cwd)) return; // mid-handoff: never judge

  const conversation = conversationSinceCompact(input.transcript_path);
  let verdict;
  if (/^new:/i.test(prompt)) {
    verdict = { new_task: true, focus: prompt.slice(4).trim().slice(0, 120), old_task: '', carry: '' };
  } else {
    debug('context tokens est', Math.round(conversation.length / 4));
    if (conversation.length / 4 < MIN_TOKENS) return;
    if (obviousFollowUp(prompt)) return; // saves the ~3.5s judge call
    verdict = judge(conversation.slice(0, 2000), conversation.slice(-6000), prompt.slice(0, 4000), input.session_id);
    debug('verdict', JSON.stringify(verdict));
    if (!verdict || verdict.new_task !== true) return; // fail open
  }

  const oneLine = s => String(s || '').replace(/\s+/g, ' ').trim();
  const archived = archive(conversation, input, oneLine(verdict.old_task).slice(0, 200) || 'earlier task');
  if (!writePending(input.cwd, { prompt: input.prompt, mode: MODE, carry: String(verdict.carry || '').slice(0, 1500), archive: archived })) return;
  const focus = oneLine(verdict.focus).slice(0, 200);
  const command = MODE === 'clear' ? '/clear' : `/compact Keep only what helps with the next task: ${focus}. ${TERSE_SUMMARY}`;
  // Claude Code puts a blocked prompt back in the input; Ctrl-C clears it first.
  // The first CR can be taken by the slash-command menu; a second CR on an empty input does nothing.
  const typed = typeLater([[0.7, '\x03'], [0.4, command], [0.8, '\r'], [0.8, '\r']]);
  const word = MODE === 'clear' ? 'clearing' : 'compacting';
  const reason = !typed
    ? `smart-compact: new task detected. Run ${MODE === 'clear' ? '/clear' : '/compact'}, then type "go". Your task is saved and will be restored.`
    : WIN
      ? `smart-compact: new task detected, ${word} first. Your task will start automatically (if nothing happens, run ${command.split(' ')[0]} and type "go").`
      : `smart-compact: new task detected, ${word} first. Your task will start automatically.`;
  process.stdout.write(JSON.stringify({ decision: 'block', reason }));
}

// After each tool call: past the context limit, stop the run, compact, and let it carry on.
function onTool(input) {
  if (process.env.SMART_COMPACT_OFF || process.env.SMART_COMPACT_CHILD || !(MAX_CONTEXT > 0)) return;
  if (readPending(input.cwd)) return;
  const tokens = contextTokens(input.transcript_path);
  debug('tool context tokens', tokens);
  if (!tokens || tokens < MAX_CONTEXT) return;
  if (!writePending(input.cwd, { mode: 'continue', tokens })) return; // another tool call got there first
  const archived = archive(conversationSinceCompact(input.transcript_path), input, 'run in progress (compacted mid-run)');
  writeJson(pendingPath(input.cwd), { mode: 'continue', tokens, archive: archived });
  // Always /compact here: /clear would drop the task itself. The input is empty after a stop, so no Ctrl-C
  // (Ctrl-C on an empty input arms "press again to exit").
  const command = `/compact Context limit reached mid-task. Keep everything needed to finish the current task: the goal, files, decisions, what is done and what is left. ${TERSE_SUMMARY}`;
  const typed = typeLater([[1.5, command], [0.8, '\r'], [0.8, '\r']]);
  const k = n => `${Math.round(n / 1000)}k`;
  process.stdout.write(JSON.stringify({
    continue: false,
    stopReason: typed
      ? `smart-compact: context at ${k(tokens)} (limit ${k(MAX_CONTEXT)}), compacting. The run continues automatically.`
      : `smart-compact: context at ${k(tokens)} (limit ${k(MAX_CONTEXT)}). Run /compact, then type "go" to continue.`,
  }));
}

function writeJson(file, data) { fs.writeFileSync(file, JSON.stringify(data), PRIVATE); }

function onResume(input) {
  const pending = readPending(input.cwd, true);
  if (!pending) return;
  // Used once: a later /clear, /compact or auto-compact must not inject this task again.
  fs.rmSync(pending.file, { force: true });
  if (pending.mode === 'continue') {
    process.stdout.write(JSON.stringify({ hookSpecificOutput: { hookEventName: 'SessionStart', additionalContext: [
      `smart-compact compacted mid-run because the context reached ${pending.tokens} tokens.`,
      'On the next message, continue the task you were doing from where you left off. Do not redo finished steps.',
      pending.archive ? `The full conversation before compaction is saved at ${pending.archive}; read it only if the summary lacks something.` : '',
    ].filter(Boolean).join('\n') } }));
    typeLater([[1.0, CONTINUE_TEXT], [0.5, '\r']]);
    return;
  }
  const parts = [
    `smart-compact freed the context (${pending.mode}) because the user started a new task.`,
    pending.carry ? `Facts from the earlier work that may matter:\n${pending.carry}` : '',
    pending.archive ? `The earlier conversation is saved verbatim at ${pending.archive}; read it only if the new task needs something from it.` : '',
    `The user's next task (verbatim), to start on their next message:\n\n${pending.prompt}`,
  ];
  process.stdout.write(JSON.stringify({
    hookSpecificOutput: { hookEventName: 'SessionStart', additionalContext: parts.filter(Boolean).join('\n\n') },
  }));
  typeLater([[1.0, RESUME_TEXT], [0.5, '\r']]);
}

// Terse mode: a short style rule at every session start (also after /compact and /clear) to cut output tokens.
const TERSE_RULES = {
  lite: 'Answer tersely: no filler, pleasantries, hedging or recap. Full sentences are fine. Keep code, commands, paths, numbers and error text exact.',
  full: 'Answer in compressed note style: drop articles, filler, pleasantries and hedging; fragments are fine; use short words. '
    + 'Keep code, commands, paths, numbers, error text and words like not/never/only exact. '
    + 'Write normal prose in code comments, commit messages, docs and messages to other people. Use plain language for security warnings.',
};
function onStart() {
  const rule = TERSE_RULES[TERSE];
  if (!rule || process.env.SMART_COMPACT_OFF || process.env.SMART_COMPACT_CHILD) return;
  process.stdout.write(JSON.stringify({ hookSpecificOutput: { hookEventName: 'SessionStart', additionalContext: `smart-compact terse mode (${TERSE}): ${rule}` } }));
}

function debug(...a) {
  if (!process.env.SMART_COMPACT_DEBUG) return;
  fs.mkdirSync(DATA_DIR, { recursive: true });
  fs.appendFileSync(path.join(DATA_DIR, 'debug.log'), `${new Date().toISOString()} ${a.join(' ')}\n`);
}

function main() {
  // recall <data dir> [words...]; words come on stdin when none are given, so the skill never puts them through the shell
  if (process.argv[2] === 'recall') {
    let words = process.argv.slice(4);
    if (!words.length) try { words = [fs.readFileSync(0, 'utf8')]; } catch {}
    process.stdout.write(recall(words) + '\n');
    return;
  }
  let input = {};
  try { input = JSON.parse(fs.readFileSync(0, 'utf8') || '{}'); } catch {}
  debug(process.argv[2], JSON.stringify({ ...input, prompt: (input.prompt || '').slice(0, 60) }));
  try {
    if (process.argv[2] === 'prompt') onPrompt(input);
    else if (process.argv[2] === 'tool') onTool(input);
    else if (process.argv[2] === 'resume') onResume(input);
    else if (process.argv[2] === 'start') onStart();
  } catch (e) {
    process.stderr.write(`smart-compact: ${e.message}\n`); // never block the user on our own bug
  }
}

main();
