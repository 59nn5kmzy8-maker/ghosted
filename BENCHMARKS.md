# ghosted_ benchmarks

Every number here comes from real Claude Code runs in hidden terminals, started from seeded conversations of a known size. Costs are what `/cost` reported, judge included. Runs that had unit tests passed them unless noted.

## Second opinion on switches (0.11.0)

The 25-prompt synthetic test looked fine, so 0.11 also tests the judge on real moments: 14 prompts from the author's own sessions that the plugin had judged, rebuilt from the transcripts exactly as they were (27k to 401k tokens, Dutch and English, with subagent reports and skill output mixed in). Each was labelled by hand: 3 should switch ("create a momo download and reroll key generator app", "add english mode for the website", a side question after a memory audit), 11 should not ("push", "deploy it when the agent is done", "why did ghosted not compress this task", "skill should be everywhere").

On these, the 0.10 judge (Haiku alone) made 2 to 4 wrong switches per round. Rewriting its rule as two steps (first: does the request act on, ask about or complain about what was just done? then: same project or not?) helped on some rounds but not reliably. Sonnet alone made none, but costs about 10x more per call.

0.11 uses both: Haiku answers first, and most prompts stop there. Only when Haiku wants to switch, Sonnet gets the same question, and the switch happens only if Sonnet agrees. If Sonnet says same, fails or runs out of time, the chat is kept. The judge now also reads only the user and assistant messages: in a 400k agent session, 5,300 of the last 6,000 characters it used to see were tool output.

| Judge | Real moments (14 × 3) | Synthetic (25 × 3) | Typical time | Cost per judged prompt |
|---|---|---|---|---|
| 0.10: Haiku | about 9 wrong switches in 42 | 70 right, 0 wrong | ~3s | ~$0.0002 to $0.0013 |
| 0.11: Haiku, Sonnet on switches | 38 right, 0 wrong switches | 69 right, 0 wrong | ~3 to 4s; ~6s when it switches | ~$0.001 average |

The 4 real misses kept the chat: three times on a quick side question, once on "add english mode for the website". A miss only means less saved; a wrong switch loses context the next prompt needed. `GHOSTED_CONFIRM_MODEL=off` turns the second opinion off.

## Speed (0.10.1)

Where the time goes on a prompt, measured on a MacBook Air:

| Step | Time | When |
|---|---|---|
| Hook start (Node) | ~70ms | every prompt, every reply |
| ghosted_'s own checks | ~15ms | every prompt |
| Reading the chat since the last compaction, 152 MB transcript | 661ms before, 297ms now | only when the judge runs |
| Stop hook after a reply in a large chat | ~100ms before, ~78ms now | every reply |
| Haiku judge | median ~2.7s | only when the judge runs |

The transcript is now searched for the last compaction in raw bytes, and only the part after it is parsed. On the 40 largest transcripts on the test machine the result is byte-for-byte identical to before. The `ps` calls that cache warming needs moved from the Stop hook into the background warmer.

Two judge changes were measured and dropped because they made no difference: a one-line system prompt instead of Claude Code's default (the default is already cached), and a shorter judge reply for "same". Over 3 rounds of the 25-prompt test, the median judge time stayed at about 2.7s either way. Most of it is the `claude` CLI starting (~1s) and the API's time to first token. The judge prompt is unchanged from 0.10.0, so its accuracy is unchanged.

## Three-way judge (0.10.0)

Since 0.10.0 the judge answers same, related or new. Related means a new job on the same project or subject: ghosted_ compacts, keeping what the new task needs, instead of clearing. The prompt now also says that sharing a name or topic with the earlier work doesn't make a request "same", and the quick follow-up rules only skip short prompts, so longer ones that point back reach the judge.

25 labelled prompts, run three times each against a seeded 33k-token coding conversation (fixing token refresh in a Next.js app):

| Group | Prompts | Expected |
|---|---|---|
| Follow-ups ("the test still fails on CI", "commit these auth fixes") | 8 | same |
| New jobs on the same app ("add rate limiting to the login endpoint") | 5 | related or new |
| Unrelated ("plan a 3-day trip to Lisbon") | 7 | new |
| Shares only a name or topic ("write a LinkedIn post announcing the app's new pricing") | 5 | related or new, never same |

| Judge | Right | Wrong switches | Missed switches |
|---|---|---|---|
| 0.9 (new task yes/no) | 68 / 75 | 1 ("commit these auth fixes" cleared) | 6 |
| 0.10 (same / related / new) | 70 / 75 | 0 | 5 |

All 5 misses in 0.10 kept the chat for a report about the work just done (a changelog entry, an incident report), where keeping the context is arguably right. The 0.9 judge cleared all related jobs; 0.10 compacted 3 of 5 and kept the summary.

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

## Measured: terse mode (scenario 4: 5 coding turns at 176k context, Opus)

Text is the characters of assistant prose shown in the terminal, not code or tool calls. Earlier terse runs were invalid because the author's own caveman hooks were active in every session; these run with no user settings or hooks (`--setting-sources project,local`) and ghosted_ loaded from the repo.

| Setup | Runs | Terminal text | Cost |
|---|---|---|---|
| No terse mode | 3 | 9,818 | $1.23 |
| caveman (user hooks, ghosted_ terse off) | 3 | 8,929 (−9%) | n/a |
| ghosted_ full, v0.5.1 rule | 4 | **7,842 (−20%)** | **$0.99 (−19%)** |
| ghosted_ lite | 2 | 8,172 (−17%) | $1.05 |

All runs passed their tests. One lite run hit a test-harness timeout and is left out. Run-to-run spread is large (full: 7,090–8,682), so treat these as direction, not decimals.

## Measured: with and without caveman (scenario 4, Opus, whole-task cost)

| Setup | Runs | Avg cost | Range |
|---|---|---|---|
| caveman + other plugins, **no ghosted_** | 3 | $3.32 | $3.11–3.71 |
| caveman + other plugins, **with ghosted_** (task switching; terse steps aside) | 6 | **$0.92** | $0.86–0.98 |
| caveman alone (isolated), ghosted_ switching on | 3 | $0.94 | $0.89–1.02 |
| ghosted_ full terse alone (isolated) | 4 | $0.99 | $0.92–1.07 |
| ghosted_ full terse **stacked** on caveman | 4 | $1.02 | $0.89–1.10 |

ghosted_ cut the cost of a caveman setup by 72%: caveman shortens replies, ghosted_ stops you paying for the old conversation on every turn, and those savings add up. The two style rules tie on cost (caveman alone wrote 10,815 characters of terminal text, ghosted_ full 7,842), and stacking them costs more, which is why terse mode's default `auto` turns itself off when caveman is active.

## Measured: mid-run compaction (one long run, Opus)

Claude Code's own auto-compact window was set to 250k, so this tests the mid-run idea itself:

| Run | Off | 250k limit |
|---|---|---|
| 176k context, re-read 2 files, write report | $3.38, 60s, no compaction | $4.43–8.27, 107–143s, 2 compactions |
| 290k context, re-read 7 files, write report | $8.61, 146s, no compaction | $9.73, 311s, 5 compactions |

The task finished correctly every time, and each run continued after compacting. But in a single run that still needs what it just read, compacting costs more: the summary has to be written, then files get read again. That is why the setting is off by default. It pays off when a run goes on long after the early context has gone stale, and when a hard context limit matters more than cost.

## Measured: cache warming (Haiku, hidden interactive sessions)

The ping has to send exactly the same request as the session, or it misses the cache. Measured with every request logged through a local proxy:

| Ping method | Cache read | Cache write | Why |
|---|---|---|---|
| `claude -p --resume` | 0 | 156,950 | print mode sends a different system prompt and tool list |
| interactive fork, message passed at startup | 73,263 | 107,419 | claude.ai and MCP tools hadn't loaded yet, so the tool list differed |
| interactive fork, message typed after 20s (shipped) | **191,089** | **372** | same tools, system prompt and messages; only cache markers move |

Since a cache hit refreshes the cache's lifetime, one ping before each expiry keeps the session warm. On a 1-hour cache, a 176k-token session costs about 0.1× its context per ping, against 2× for rewriting it after the break.

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

