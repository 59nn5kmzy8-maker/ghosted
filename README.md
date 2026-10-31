<p align="center">
  <img src="assets/logo.png" alt="ghosted_" width="560">
</p>

<p align="center">
  <b>Stop paying for context you no longer need.</b><br>
  A Claude Code plugin that frees the context when you switch task, then starts your task for you.
</p>

<p align="center">
  <a href="https://github.com/giovanbelle/ghosted/actions/workflows/test.yml"><img src="https://github.com/giovanbelle/ghosted/actions/workflows/test.yml/badge.svg" alt="tests"></a>
  <a href="LICENSE"><img src="https://img.shields.io/badge/license-Apache--2.0-white" alt="Apache-2.0"></a>
  <a href="BENCHMARKS.md"><img src="https://img.shields.io/badge/measured-20%25%20to%2070%25%20cheaper%20on%20task%20switches-black" alt="20% to 70% cheaper on task switches"></a>
  <a href="https://giovanbelle.github.io/ghosted/"><img src="https://img.shields.io/badge/site-ghosted__-black" alt="site"></a>
</p>

---

Claude Code only compacts when the context is nearly full. So when you finish one task and start another, every new message still carries the whole old conversation, and you pay for it again on every turn.

**ghosted_** notices the switch. A small Haiku judge decides whether your prompt starts a new task. If it does, ghosted_ archives the old conversation, clears the context, puts your prompt back and starts it. You keep typing as usual.

| Measured on Opus 5.5 | Without | With ghosted_ |
|---|---|---|
| Open chat: a big read, then 12 turns of new work (2 runs each) | $4.82 | **$3.87 (−20%)** |
| Coming back to a big chat after its cache expired (36 runs, 6 scenarios) | $15.88 | **$4.78 (−70%)** |
| Open chat: a few short jobs after the switch | | about the same (−0 to −4%) |

Inside a chat you keep using, old context is cheap: Opus 5.5 reads cached tokens at 5% of the input price, so the saving grows with how much work follows the switch. When you return to a big chat after its cache expired (an hour on a subscription), every old token has to be cached again at twice the input price, and that is where clearing saves the most. Tests passed in every run.

Already using caveman? ghosted_ still cut a caveman setup's cost from $3.32 to $0.92 (−72%), because caveman shortens replies and ghosted_ drops the old conversation. Full numbers, including where it doesn't help, are in [BENCHMARKS.md](BENCHMARKS.md).

## Install

First check Node.js: `node -v`. If it says "command not found", install Node from [nodejs.org](https://nodejs.org); Claude Code's own installer doesn't include it.

```sh
claude plugin marketplace add giovanbelle/ghosted
claude plugin install ghosted@ghosted
```

Restart Claude Code and press Enter on the one setup question to keep the default. Then work as usual: the first time you start a new task you'll see a line from ghosted_, and your task starts by itself. Wrong call? `/resume` brings the old chat back.

## What it does

- **Task switch:** when there's more than about 20k tokens of context, a Haiku judge sorts each prompt that isn't an obvious follow-up into one of three:
  - **same:** it continues the current work. Nothing happens.
  - **related:** a new job on the same project or subject. ghosted_ runs `/compact`, keeping what the new task needs, then starts it.
  - **new:** an unrelated task. ghosted_ runs `/clear`, then starts it with up to 5 facts from the old work.

  The old chat is archived first, and `/resume` brings it back if the call was wrong.
- **Terse answers (on by default):** answers without filler. The default, lite, keeps full sentences. `full` turns them into compressed notes like caveman (20% less text and 19% lower cost in tests). Code and files Claude writes stay normal.
- **Cache warming (on, 1 hour):** Claude's prompt cache expires after 5 minutes, or 1 hour on most subscriptions. After a longer break, your next message writes the whole context to the cache again, at 1.25× or 2× the input price. While you're away, ghosted_ re-sends the session just before the cache expires, through a hidden copy of the session that is deleted right after. A cache read costs 0.1× the input price. It stops once you're back, when Claude Code closes, and before the pings cost half of the rewrite they prevent. Measured: one ping read 191,089 tokens from the cache and wrote 372.
- **Dashboard:** `/ghosted-stats` opens a local page (127.0.0.1, only you can open it) with task switches, tokens dropped, an estimated saving at your own price, warm pings, judge spend and archive search. It stops itself after 30 idle minutes.
- **Recall:** every cleared or summarised conversation is archived and indexed for 30 days. `/ghosted-recall <words>` returns a short digest of the matching work.

Anything that goes wrong fails open: your prompt goes through as if ghosted_ weren't there.

## Settings

| Setting | Default | |
|---|---|---|
| Keep the cache warm for | `1h` | after your last turn; `off` to disable, e.g. `90m`. Asked at install, or `/ghosted warm` |
| Terse answers | `auto` | `auto` = `lite`, or off when caveman is already active; also `full`, `off`. `/ghosted terse` |
| Check for a new task above | about 20k tokens | `GHOSTED_MIN_TOKENS` |
| Keep archives for | 30 days | `GHOSTED_ARCHIVE_DAYS` (0 = forever) |

Environment overrides: `GHOSTED_KEEP_WARM`, `GHOSTED_TERSE`, `GHOSTED_MIN_TOKENS`, `GHOSTED_ARCHIVE_DAYS`, `GHOSTED_MODE=compact` (compact unrelated tasks too) and `GHOSTED_OFF=1`.

## Commands

| | |
|---|---|
| `/ghosted` | status and the list below |
| `/ghosted-stats` | opens the local dashboard: switches, tokens dropped, estimated savings, warm pings, judge spend, archive search |
| `/ghosted-off` · `/ghosted on` | pause or resume everything |
| `/ghosted-recall <words>` | find archived work |
| `/resume` | Claude Code's own command: go back to the chat from before a switch |
| `new:` · `same:` before a prompt | force or block a task switch |
| `/ghosted terse` · `full` · `lite` · `off` | shorter answers |
| `/ghosted warm` · `90m` · `off` | keep the prompt cache warm for 1h (or the time you give) after your last turn |
| `/ghosted setup` · `off` | auto-typing in any terminal (VS Code, Ghostty, Alacritty) |

The slash menu shows plugin commands with a prefix (`/ghosted:ghosted`); typing `/ghosted` works too. Settings stick across sessions; environment variables still win over them.

## Platforms

| | Judge, recall, terse | Types the commands for you | Cache warming |
|---|---|---|---|
| macOS Terminal.app, iTerm2 | yes | yes (AppleScript; asks once for permission) | yes |
| tmux, inside any terminal (VS Code, Linux, SSH) | yes | yes (`tmux send-keys`) | yes |
| WezTerm, kitty (with remote control on) | yes | yes (their CLI) | yes |
| Windows console, Windows Terminal | yes | yes (`WriteConsoleInput`, tested in CI) | yes (ConPTY, tested in CI) |
| VS Code terminal, Ghostty, Alacritty, any other terminal | yes | yes, after running `/ghosted setup` once (macOS, Linux) | yes |

Needs Node.js and the `claude` CLI on your PATH. Cache warming and the terminal bridge use `python3` on macOS and Linux. No other dependencies.

**Terminal bridge.** VS Code's terminal, Ghostty and Alacritty give outside programs no way to type into them. `/ghosted setup` adds a small `claude` function to your shell config (zsh, bash or fish). It runs Claude Code through a pass-through pseudo-terminal with a private pipe for ghosted_'s keystrokes, the way tmux would. Everything you type and see is unchanged. It falls back to plain `claude` whenever python3 or the script is missing. `/ghosted setup off` removes it.

## How it works

```
your prompt ──► UserPromptSubmit hook
                 ├─ small context, bare or built-in command, "same:", obvious follow-up ──► passes through
                 └─ Haiku judge: same, related or new?
                      ├─ same    ──► passes through
                      ├─ related ──► archive old chat, save prompt, block, type /compact (keep what the task needs)
                      └─ new     ──► archive old chat, save prompt, block, type /clear
                                   └─► SessionStart hook: inject prompt + carried facts,
                                       type "Start the pending task."
```

The judge runs `claude -p --model haiku` with no settings, plugins, MCP servers or tools loaded, and reads only the user and assistant messages. It scores how much the request depends on the last few messages and how much it needs the earlier conversation at all: a follow-up keeps the chat, a new feature, page, document or analysis on the same project is compacted, and unrelated work is cleared. It runs at low effort (no thinking). Typical cost is under $0.001 and about 3 seconds per judged prompt. Short chats on top of the fixed system prompt are never judged: the size check uses Claude's own token count minus the session's first request, so attached files count and plugin or MCP overhead doesn't. Obvious follow-ups (short replies, "ok", "fix it", short back-references like "that file") skip it.

## Limits

- A wrong switch drops context the prompt needed. On 177 real moments from the author's sessions, labelled with hindsight, 157 calls were right and none cleared a chat that was needed. The old chat is archived first, `/resume` brings it back, and `same:` prevents it.
- Terse mode shortens the text you read, not code or tool calls, so its saving depends on how much of a session is prose.
- Cache warming spends a little to save more only if you come back to the session. Each ping costs about a tenth of the context, and it stops at half the cost of the rewrite it prevents. If a ping ever misses the cache, warming stops for that session. Turn it off with `/ghosted warm off`.
- The transcript's `compact_boundary` marker isn't documented. If it changes, ghosted_ judges more often but stays safe.

## Develop

```sh
node --test                      # unit tests
claude --plugin-dir .            # try your checkout without installing
```

## License

[Apache-2.0](LICENSE). Copyright 2026 Gio van Belle.
