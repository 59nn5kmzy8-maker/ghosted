#!/usr/bin/env node
// smart-compact: when the user switches task, free the context (/compact or /clear), then start that task.
// `prompt` runs on UserPromptSubmit, `resume` on SessionStart(compact|clear).
const fs = require('fs');
const os = require('os');
const path = require('path');
const crypto = require('crypto');
const { spawn, spawnSync } = require('child_process');

const MIN_TOKENS = Number(process.env.SMART_COMPACT_MIN_TOKENS || 20000);
const MODE = process.env.SMART_COMPACT_MODE === 'compact' ? 'compact' : 'clear';
const PENDING_TTL_MS = 10 * 60 * 1000;
const RESUME_TEXT = 'Start the pending task.';
const DATA_DIR = process.env.CLAUDE_PLUGIN_DATA || path.join(os.homedir(), '.claude', 'smart-compact');
const WIN = process.platform === 'win32';

// Keyed by working directory, not session: /clear starts a new session id.
// shortcut: two sessions switching task in the same folder within seconds would share it; key by terminal if that happens.
function pendingPath(cwd) {
  const key = crypto.createHash('sha1').update(String(cwd || '')).digest('hex').slice(0, 16);
  return path.join(DATA_DIR, 'pending', `${key}.json`);
}

function readPending(cwd) {
  const file = pendingPath(cwd);
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
    'Reply with only JSON:',
    '{"new_task": true|false, "focus": "<5-15 word summary of the new request>",',
    ' "old_task": "<5-20 word summary of the earlier work>",',
    ' "carry": "<only if new_task: up to 5 terse lines of facts from the earlier conversation the new request still needs (paths, names, decisions); empty string if none>"}',
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

// Compaction is lossy: keep the old conversation byte-exact on disk, and index it in caveman memory
// (cavemem) when the caveman CLI is installed, so `caveman mem recall` finds it from any later session.
function archive(conversation, input, oldTask) {
  if (process.env.SMART_COMPACT_ARCHIVE === '0') return null;
  const dir = path.join(DATA_DIR, 'archive');
  fs.mkdirSync(dir, { recursive: true });
  const file = path.join(dir, `${new Date().toISOString().replace(/[:.]/g, '-')}-${String(input.session_id).slice(0, 8)}.md`);
  fs.writeFileSync(file, `# smart-compact archive\ncwd: ${input.cwd}\nsession: ${input.session_id}\ntask: ${oldTask}\n\n${conversation}\n`);
  if (process.env.SMART_COMPACT_CAVEMAN !== '0') {
    const note = `smart-compact archive ${new Date().toISOString().slice(0, 10)} in ${input.cwd}: ${oldTask}. Full log: ${file}`;
    const child = spawn('caveman', ['mem', 'remember', note], { detached: true, stdio: 'ignore', shell: WIN, windowsHide: true });
    child.on('error', () => {}); // caveman not installed: the file alone is enough
    child.unref();
  }
  return file;
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
    if (!tty) return false;
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

function onPrompt(input) {
  const prompt = (input.prompt || '').trim();
  if (process.env.SMART_COMPACT_OFF || process.env.SMART_COMPACT_CHILD) return;
  // `!` is Claude Code's shell mode, so the overrides are plain-word prefixes.
  if (prompt.startsWith('/') || /^same:/i.test(prompt)) return;

  const pending = readPending(input.cwd);
  if (pending) {
    if (prompt === RESUME_TEXT) fs.rmSync(pending.file, { force: true });
    return; // mid-handoff: never judge
  }

  const conversation = conversationSinceCompact(input.transcript_path);
  let verdict;
  if (/^new:/i.test(prompt)) {
    verdict = { new_task: true, focus: prompt.slice(4).trim().slice(0, 120), old_task: '', carry: '' };
  } else {
    debug('context tokens est', Math.round(conversation.length / 4));
    if (conversation.length / 4 < MIN_TOKENS) return;
    verdict = judge(conversation.slice(0, 2000), conversation.slice(-6000), prompt.slice(0, 4000), input.session_id);
    debug('verdict', JSON.stringify(verdict));
    if (!verdict || verdict.new_task !== true) return; // fail open
  }

  const oneLine = s => String(s || '').replace(/\s+/g, ' ').trim();
  const archived = archive(conversation, input, oneLine(verdict.old_task).slice(0, 200) || 'earlier task');
  fs.mkdirSync(path.dirname(pendingPath(input.cwd)), { recursive: true });
  fs.writeFileSync(pendingPath(input.cwd), JSON.stringify({
    prompt: input.prompt, mode: MODE, carry: String(verdict.carry || '').slice(0, 1500), archive: archived,
  }));
  const focus = oneLine(verdict.focus).slice(0, 200);
  const command = MODE === 'clear' ? '/clear' : `/compact Keep only what helps with the next task: ${focus}`;
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

function onResume(input) {
  const pending = readPending(input.cwd);
  if (!pending) return;
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
