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

```sh
claude plugin marketplace add giovanbelle/ghosted
claude plugin install ghosted@ghosted
```

Restart Claude Code. You'll be asked for the settings below; change them any time in `/config`.

## What it does

- **Task switch:** when there's more than about 20k tokens of context and your prompt starts something new, ghosted_ runs `/clear` (or `/compact`), restores your prompt and types `Start the pending task.` Up to 5 facts from the old work and the archive path come along.
- **Long runs (optional):** past a limit you choose (for example 250k), it stops the run, compacts, and types `Continue where you left off.`
- **Terse answers (on by default):** compressed notes in the terminal, like caveman, with a one-line reminder on every prompt so it doesn't fade. In tests: 20% less text and 19% lower cost than no terse mode, and less text than caveman. Code and files Claude writes stay normal.
- **Cache warming (on, 2 hours):** Claude's prompt cache expires after 5 minutes, or 1 hour on most subscriptions. After a longer break, your next message writes the whole context to the cache again, at 1.25× or 2× the input price. While you're away, ghosted_ re-sends the session just before the cache expires, through a hidden copy of the session that is deleted right after. A cache read costs 0.1× the input price. It stops once you're back, when Claude Code closes, and before the pings cost half of the rewrite they prevent. Measured: one ping read 191,089 tokens from the cache and wrote 372.
- **Recall:** every cleared conversation is archived and indexed. `/ghosted:recall <words>` returns a short digest of the matching work.

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
| `/ghosted full` · `lite` · `auto` · `off` | terse answers (`auto` = full, off when caveman is active) |
| `/ghosted max 250k` · `max off` | compact mid-run at this context size, then continue |
| `/ghosted warm 2h` · `warm off` | keep the prompt cache warm this long after your last turn |
| `/ghosted pause` · `resume` | turn ghosted_ off or on |
| `/ghosted stats` | task switches, mid-run compactions, judge calls and their cost |
| `/ghosted reset` · `help` | back to your `/config` settings · list the commands |
| `/ghosted:recall <words>` | find archived work |
| `new: <prompt>` · `same: <prompt>` | force or block a task switch |

`/ghosted` settings stick across sessions. Environment variables still win over them.

## Platforms

| | Judge, recall, terse | Auto-typing |
|---|---|---|
| macOS Terminal.app | yes | yes (AppleScript into your tab; asks once for permission) |
| Windows console | yes | yes (`WriteConsoleInput`, tested in CI) |
| iTerm, tmux, VS Code, Linux | yes | no: it tells you which command to run, then type `go` |

Needs Node.js and the `claude` CLI on your PATH. Cache warming also needs `python3` (its built-in `pty` module) and runs on macOS and Linux only. No other dependencies.

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
