# ghosted_ benchmarks

Every number here comes from real Claude Code runs in hidden terminals, started from seeded conversations of a known size. Costs are what `/cost` reported, judge included. Runs that had unit tests passed them unless noted.

## Measured: clear vs compact vs off (v0.2.0)

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

## Measured: terse mode (scenario 4, Opus, 3 runs each)

| Terse | Avg cost | Avg output tokens |
|---|---|---|
| off | $0.90 | 9.9k |
| lite | $1.26 | 13.4k |
| full | $0.95 (2 runs) | 10.8k |

All runs passed their tests. Terse mode did not lower the cost of a coding task: most of the output is code and tool calls, which a style rule doesn't shorten, and with `lite` the model even wrote more. That is why it is off by default. It is there for chat-heavy use, where the answer text is most of the output.

## Measured: mid-run compaction (one long run, Opus)

Claude Code's own auto-compact window was set to 250k, so this tests the mid-run idea itself:

| Run | Off | 250k limit |
|---|---|---|
| 176k context, re-read 2 files, write report | $3.38, 60s, no compaction | $4.43–8.27, 107–143s, 2 compactions |
| 290k context, re-read 7 files, write report | $8.61, 146s, no compaction | $9.73, 311s, 5 compactions |

The task finished correctly every time, and each run continued after compacting. But in a single run that still needs what it just read, compacting costs more: the summary has to be written, then files get read again. That is why the setting is off by default. It pays off when a run goes on long after the early context has gone stale, and when a hard context limit matters more than cost.

## Judge accuracy

32 labelled prompts (15 follow-ups, 17 new tasks), run three times against a real 176k-token conversation. In the last two rounds there were 0 wrong switches. The two misses were real new tasks where the judge call timed out, which fails safe (no switch). Obvious follow-ups skip the judge entirely; in the last round that was 14 of 64 prompts.

## Earlier: 10 A/B scenarios (v0.1.8, compact mode, older judge)

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

