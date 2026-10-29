# smart-compact

A Claude Code plugin that frees context when you switch to a new task, not when you hit the context limit. It can also compact a long run mid-run and let it carry on, and it ships its own terse-answer mode and recall of archived work.

## How it works

1. You send a prompt. A `UserPromptSubmit` hook checks whether there's enough context since the last compaction (default about 20k tokens). If so, Haiku decides whether the prompt is a new task or a continuation.
2. For a new task, the hook saves your prompt and archives the old conversation, then blocks the prompt. It types `/clear` into your session (or `/compact Keep only what helps with the next task: <focus>` in compact mode).
3. After that, a `SessionStart` hook (matcher `compact|clear`) injects your saved prompt, any facts carried over and the archive path, then types `Start the pending task.` Claude then does your task with clean context.

4. Mid-run (optional, off by default): a `PostToolUse` hook reads the real context size from the API usage in the transcript. When it passes your limit, the hook stops the run, archives the conversation and types `/compact` (always compact here: clear would drop the task). After that it types `Continue where you left off.` and Claude picks the task back up.
5. Terse mode: a `SessionStart` hook adds a short style rule (lite or full) so answers use fewer output tokens. It is added again after every `/compact` and `/clear`.

Any error fails open: your prompt goes through as normal.

## Install

```sh
claude plugin marketplace add 59nn5kmzy8-maker/smart-compact
claude plugin install smart-compact@smart-compact
```

To try it without installing, run `claude --plugin-dir ~/smart-compact`.

## Settings

When you enable the plugin, Claude Code asks for these. Change them later in `/config`:

| Setting | Default | What it does |
|---|---|---|
| Compact mid-run at (tokens) | 0 (off) | During a long run, compact at this context size (for example 250000), then continue |
| Check for a new task above (tokens) | 20000 | Below this, prompts are never judged |
| Terse answers | lite | `off`, `lite` (no filler) or `full` (compressed note style) |

An environment variable overrides each one: `SMART_COMPACT_MAX_CONTEXT`, `SMART_COMPACT_MIN_TOKENS`, `SMART_COMPACT_TERSE`.

## Commands and controls

- `new: <prompt>`: force a switch.
- `same: <prompt>`: skip it.
- `SMART_COMPACT_MODE=compact`: use `/compact` instead of the default `/clear`. It keeps a summary of the old conversation but costs about twice as much (see below). Clear mode keeps only up to 5 lines of carried-over facts from the judge, plus the archive.
- `/smart-compact:recall <words>`: find archived work and show a digest of it (user and assistant messages only, tool output dropped, capped at about 6k characters). Claude also uses it on its own when you ask about earlier work.
- `SMART_COMPACT_ARCHIVE=0`: don't archive the old conversation.
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

## Memory and compression

Compaction loses information, so before each switch or mid-run compaction the plugin writes the old conversation verbatim to `${CLAUDE_PLUGIN_DATA}/archive/` and lists it in `archive/index.jsonl`. `recall` searches that index and the archive text and returns a digest, not the whole log. What is carried into the new task is kept small: the judge writes up to 5 note-style lines, and `/compact` is asked for a terse summary that keeps paths, names, numbers and decisions exact.

## Measured: mid-run compaction (one long run, Opus)

Claude Code's own auto-compact window was set to 250k, so this tests the mid-run idea itself:

| Run | Off | 250k limit |
|---|---|---|
| 176k context, re-read 2 files, write report | $3.38, 60s, no compaction | $4.43–8.27, 107–143s, 2 compactions |
| 290k context, re-read 7 files, write report | $8.61, 146s, no compaction | $9.73, 311s, 5 compactions |

The task finished correctly every time, and each run continued after compacting. But in a single run that still needs what it just read, compacting costs more: the summary has to be written, then files get read again. That is why the setting is off by default. It pays off when a run goes on long after the early context has gone stale, and when a hard context limit matters more than cost.

## Platforms

- **macOS:** auto-typing works in Terminal.app, through AppleScript `do script` aimed at your tab's tty. It doesn't focus or raise the window. macOS asks once for permission to let the hook control Terminal.
- **Windows:** `type-keys.ps1` attaches to Claude Code's console and writes key events with `WriteConsoleInput`, so no focus is needed. CI checks this end to end on `windows-latest`. If typing fails, the block message tells you to run the command yourself.
- **Elsewhere** (iTerm, tmux, VS Code's terminal, Linux): nothing is typed for you. The message tells you which command to run (`/clear` or `/compact`) and then to type `go`. Your task is still restored, or the run still continues. Judge, terse mode, recall and archive work the same everywhere.
- **Requirements:** Node.js on PATH (the hooks are a single Node file with no dependencies) and the `claude` CLI for the Haiku judge.

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

## License

Copyright (c) 2026 gio. All rights reserved. See `LICENSE`.
