# smart-compact

A Claude Code plugin that frees context when you switch to a new task, not when you hit the context limit.

## How it works

1. You send a prompt. A `UserPromptSubmit` hook checks whether there's enough context since the last compaction (default about 20k tokens). If so, Haiku decides whether the prompt is a new task or a continuation.
2. For a new task, the hook saves your prompt and archives the old conversation, then blocks the prompt. It types `/clear` into your session (or `/compact Keep only what helps with the next task: <focus>` in compact mode).
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
- `SMART_COMPACT_MODE=compact`: use `/compact` instead of the default `/clear`. It keeps a summary of the old conversation but costs about twice as much (see below). Clear mode keeps only up to 5 lines of carried-over facts from the judge, plus the archive.
- `SMART_COMPACT_MIN_TOKENS`: the size threshold.
- `SMART_COMPACT_ARCHIVE=0`: don't archive the old conversation.
- `SMART_COMPACT_CAVEMAN=0`: don't index archives in caveman memory.
- `SMART_COMPACT_OFF=1`: turn the plugin off.

## Measured: clear vs compact vs off (0.2.0)

Six scenarios, three arms each, two repetitions per arm (36 runs, Opus). Costs are averages per run, judge included. Each run started from its own clone of the seed, so no run reused another's prompt cache.

| # | Context | Turns | Off | Compact | Clear | Clear saved |
|---|---|---|---|---|---|---|
| 2 | 57k | 5 | $1.96 | $1.76 | $1.08 | 45% |
| 3 | 176k | 1 | $2.12 | $1.11 | $0.31 | 85% |
| 4 | 176k | 5 | $2.96 | $2.06 | $0.99 | 67% |
| 6 | 290k | 6 | $4.58 | $3.01 | $1.29 | 72% |
| 8 | 176k | 2, half-related | $1.89 | $1.18 | $0.52 | 72% |
| 10 | 176k | 3 different tasks | $2.38 | $1.35 | $0.58 | 76% |

Total: off $15.88, compact $10.47 (34% saved), clear $4.78 (70% saved). Wall time was about the same: 666s off, 720s compact, 674s clear. Tests passed in every run that had tests. The judge cost $0.0013 per switch, $0.033 across all 24 plugin runs. Since then, clear has been the default.

Two more scenarios, run the same way:

| # | Context | Model | Turns | Off | Compact | Clear |
|---|---|---|---|---|---|---|
| 7 | 176k | Opus | 2, related follow-up | $1.99 | $1.97 | $1.27 |
| 9 | 176k | Sonnet | 3 | $1.25 | $0.86 | $0.42 |

In scenario 7 the right answer is not to switch, and the judge got it right in 3 of 4 runs. In the fourth it judged "From the files you already read: write notes.md…" a new task, cleared, and `notes.md` was never written. That is the risk clear mode carries: a wrong switch loses what the request points at. 0.3.1 tells the judge to treat back-references as the same task and to answer SAME when unsure. In a recheck the follow-up was judged same 8 of 8 times, and real new tasks were still judged new 6 of 6 times. In 4 more full runs of scenario 7 on 0.3.1, the plugin never switched, and `notes.md` was written every time. If a switch is wrong, `same: <prompt>` prevents it, and the archive keeps the old conversation.

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

## Measured: 10 A/B scenarios (0.1.8, compact mode, older judge)

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
