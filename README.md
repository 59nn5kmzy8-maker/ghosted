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
  <a href="BENCHMARKS.md"><img src="https://img.shields.io/badge/measured-70%25%20cheaper%20on%20task%20switches-black" alt="70% cheaper on task switches"></a>
  <a href="https://giovanbelle.github.io/ghosted/"><img src="https://img.shields.io/badge/site-ghosted__-black" alt="site"></a>
</p>

---

Claude Code only compacts when the context is nearly full. So when you finish one task and start another, every new message still carries the whole old conversation, and you pay for it again on every turn.

**ghosted_** notices the switch. A small Haiku judge decides whether your prompt starts a new task. If it does, ghosted_ archives the old conversation, clears the context, puts your prompt back and starts it. You keep typing as usual.

| | Without | With ghosted_ |
|---|---|---|
| 36 runs, 6 scenarios (Opus) | $15.88 | **$4.78 (−70%)** |
| Wall time | 666s | 674s |
| Tests passing | all | all |

Already using caveman? ghosted_ still cut a caveman setup's cost from $3.32 to $0.92 (−72%), because caveman shortens replies and ghosted_ drops the old conversation. Full numbers, including where it doesn't help, are in [BENCHMARKS.md](BENCHMARKS.md).

## Install

First check Node.js: `node -v`. If it says "command not found", install Node from [nodejs.org](https://nodejs.org); Claude Code's own installer doesn't include it.

```sh
claude plugin marketplace add giovanbelle/ghosted
claude plugin install ghosted@ghosted
```

Restart Claude Code and press Enter on the setup questions to keep the defaults (change them any time in `/config`). Then work as usual: the first time you start a new task you'll see a line from ghosted_, and your task starts by itself.

## What it does

- **Task switch:** when there's more than about 20k tokens of context and your prompt starts something new, ghosted_ runs `/clear` (or `/compact`), restores your prompt and types `Start the pending task.` Up to 5 facts from the old work and the archive path come along.
- **Long runs (optional):** past a limit you choose (for example 250k), it stops the run, compacts, and types `Continue where you left off.`
- **Terse answers (on by default):** compressed notes in the terminal, like caveman, with a one-line reminder on every prompt so it doesn't fade. In tests: 20% less text and 19% lower cost than no terse mode, and less text than caveman. Code and files Claude writes stay normal.
- **Cache warming (on, 2 hours):** Claude's prompt cache expires after 5 minutes, or 1 hour on most subscriptions. After a longer break, your next message writes the whole context to the cache again, at 1.25× or 2× the input price. While you're away, ghosted_ re-sends the session just before the cache expires, through a hidden copy of the session that is deleted right after. A cache read costs 0.1× the input price. It stops once you're back, when Claude Code closes, and before the pings cost half of the rewrite they prevent. Measured: one ping read 191,089 tokens from the cache and wrote 372.
- **Dashboard:** `/ghosted-stats` opens a local page (127.0.0.1, only you can open it) with task switches, tokens dropped, an estimated saving at your own price, warm pings, judge spend and archive search. It stops itself after 30 idle minutes.
- **Recall:** every cleared conversation is archived and indexed. `/ghosted-recall <words>` returns a short digest of the matching work.

Anything that goes wrong fails open: your prompt goes through as if ghosted_ weren't there.

## Settings

| Setting | Default | |
|---|---|---|
| Compact mid-run at (tokens) | `0` (off) | e.g. `250000` or `250k`; values under 100k count as 100k |
| Check for a new task above (tokens) | `20000` | below this, prompts are never judged |
| Keep the cache warm for | `2h` | after your last turn; `off` to disable, e.g. `90m` |
| Terse answers | `auto` | `auto` = `full` (compressed notes), or off when caveman is already active; also `full`, `lite`, `off` |

Each has an environment override: `GHOSTED_MAX_CONTEXT`, `GHOSTED_MIN_TOKENS`, `GHOSTED_KEEP_WARM`, `GHOSTED_TERSE`. Also `GHOSTED_MODE=compact` (compact instead of clear on a switch) and `GHOSTED_OFF=1`.

## Commands

| | |
|---|---|
| `/ghosted` | status and the list below |
| `/ghosted-stats` | opens the local dashboard: switches, tokens dropped, estimated savings, warm pings, judge spend, archive search |
| `/ghosted-terse` · `lite` · `off` | terse answers on, lighter, or off |
| `/ghosted-warm` · `90m` · `off` | keep the prompt cache warm for 2h (or the time you give) after your last turn |
| `/ghosted-off` · `/ghosted-on` | pause or resume everything |
| `/ghosted-setup` · `off` | auto-typing in any terminal (VS Code, Ghostty, Alacritty) |
| `/ghosted-recall <words>` | find archived work |
| `new:` · `same:` before a prompt | force or block a task switch |

Less common settings still work through `/ghosted <setting>`, for example `/ghosted max 250k` for mid-run compaction. Settings stick across sessions; environment variables still win over them.

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
                 ├─ small context, slash command, "same:", obvious follow-up ──► passes through
                 └─ Haiku judge: new task?
                      ├─ no  ──► passes through
                      └─ yes ──► archive old chat, save prompt, block, type /clear
                                   └─► SessionStart hook: inject prompt + carried facts,
                                       type "Start the pending task."
```

The judge runs `claude -p --model haiku` with no settings, plugins, MCP servers or tools loaded, at about $0.0013 a switch and 3.5s. Obvious follow-ups ("ok", "also…", "fix it", "that file") skip it.

## Limits

- A wrong "new task" verdict drops the context the prompt needed. It's rare (0 in the last 64 judged prompts), the old conversation is always archived, and `same:` prevents it.
- Mid-run compaction cost more than it saved in single long runs, so it's off by default.
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
