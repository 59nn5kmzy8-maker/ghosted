# smart-compact

A Claude Code plugin that compacts context when you switch to a new task, not when you hit the context limit.

## How it works

1. You send a prompt. A `UserPromptSubmit` hook checks whether there's enough context since the last compaction (default about 20k tokens). If so, Haiku decides whether the prompt is a new task or a continuation.
2. For a new task, the hook saves your prompt and archives the old conversation, then blocks the prompt. It types `/compact Keep only what helps with the next task: <focus>` into your session (or `/clear` in clear mode).
3. After that, a `SessionStart` hook (matcher `compact|clear`) injects your saved prompt, any facts carried over and the archive path, then types `Start the pending task.` Claude then does your task with clean context.

Any error fails open: your prompt goes through as normal.

## Install

```sh
claude plugin marketplace add 59nn5kmzy8-maker/smart-compact
claude plugin install smart-compact@smart-compact
```

To try it without installing, run `claude --plugin-dir ~/smart-compact`.

## Controls

- `new: <prompt>`: force a switch.
- `same: <prompt>`: skip it.
- `SMART_COMPACT_MODE=clear`: use `/clear` instead of `/compact`. It's cheaper and faster, but keeps no summary, only up to 5 lines of carried-over facts from the judge plus the archive.
- `SMART_COMPACT_MIN_TOKENS`: the size threshold.
- `SMART_COMPACT_ARCHIVE=0`: don't archive the old conversation.
- `SMART_COMPACT_CAVEMAN=0`: don't index archives in caveman memory.
- `SMART_COMPACT_OFF=1`: turn the plugin off.

## Caveman connection

Compaction loses information. Before each switch the plugin writes the old conversation verbatim to `${CLAUDE_PLUGIN_DATA}/archive/`. If the caveman CLI is installed, it also stores a short entry in caveman memory (`caveman mem remember`) with the old task and the archive path. Any later session can then find the old work with `caveman mem recall <words>` and open the full log. After the switch, Claude is told where the archive is and reads it only if the new task needs it.

## Platforms

- **macOS:** auto-typing works in Terminal.app, through AppleScript `do script` aimed at your tab's tty. It doesn't focus or raise the window. macOS asks once for permission to let the hook control Terminal.
- **Windows:** `type-keys.ps1` attaches to Claude Code's console and writes key events with `WriteConsoleInput`, so no focus is needed. CI checks this end to end on `windows-latest`. If typing fails, the block message tells you to run the command yourself.
- **Elsewhere** (iTerm, tmux, Linux): the block message asks you to run `/compact` and then type `go`. The task is still restored.

## Known limits

- Each judged prompt adds about 5s, because `claude -p` starts a new process. The judge runs with `--setting-sources= --strict-mcp-config --tools= --disable-slash-commands`, so none of your hooks, plugins or MCP servers load into it. That costs about $0.0004 per judgement instead of $0.005.
- The transcript's `compact_boundary` marker isn't documented. If it changes, the whole transcript counts toward the size check, so the judge just runs more often.
- The pending task is keyed by working directory, because `/clear` starts a new session id. Two sessions in the same folder switching task at the same moment would collide.

## Measured: 10 A/B scenarios

Each scenario ran twice, without and with the plugin, starting from the same seeded context. The two runs used separate seeds, so the second couldn't benefit from the first's prompt cache. The context in the seed was the real token count from the API.

| # | Context | Model | Turns | Without | With (incl. judge) | Saved | Time diff |
|---|---|---|---|---|---|---|---|
| 1 | 57k | Opus | 1 | $1.76 | $2.14 | -22% | +16s |
| 2 | 57k | Opus | 5 | $1.63 | $1.37 | 16% | +12s |
| 3 | 176k | Opus | 1 | $3.07 | $2.47 | 20% | +22s |
| 4 | 176k | Opus | 5 | $4.22 | $3.12 | 26% | -15s |
| 5 | 290k | Opus | 3 | $5.59 | $4.29 | 23% | -4s |
| 6 | 290k | Opus | 6 | $6.77 | $4.69 | 31% | +34s |
| 7 | 176k | Opus | 2, related task | $3.21 | $3.23 | 0% (judge kept the context, correctly) | +6s |
| 8 | 176k | Opus | 2, half-related | $3.29 | $2.73 | 17% | +22s |
| 9 | 176k | Sonnet | 3 | $2.07 | $2.00 | 4% | +26s |
| 10 | 176k | Opus | 3 different tasks | $3.47 | $2.69 | 22% | +12s |

Total: $35.08 without, $28.72 with, so the plugin saved 18%. Tests passed in every run that had tests. The judge cost $0.005–0.013 per run.

- The more context there is and the more turns follow, the bigger the saving. A small context followed by a single turn loses money.
- Compaction adds 10–74s, but later turns are faster, so long tasks often finish sooner.
- Related follow-ups are not compacted. The only cost of the plugin there is the judge.
- With `--fork-session`, the first prompt is never judged, because the new transcript is still empty at that point.

## Test

```sh
node --test
```
