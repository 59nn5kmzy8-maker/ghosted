# ghosted_ benchmarks

Every number here comes from real Claude Code runs in hidden terminals, started from seeded conversations of a known size. Costs are what `/cost` reported, judge included. Runs that had unit tests passed them unless noted.

## Off, compact, clear and handoff notes (0.14.1, Opus 5.5)

Same setup as the section below: scripted chats in hidden terminals, warm cache, each chat starting by reading large standard-library files. "Compact" runs 0.14.1 with `GHOSTED_RELATED=compact` (the 0.13 behaviour for related tasks); "notes" is the 0.14 default, a fresh chat seeded with Haiku handoff notes. Totals are the sum of `/cost` across clears.

| Chat after the reading | Off | Compact | Notes | Clear |
|---|---|---|---|---|
| cli: a related new tool, then 3 feature turns (3 / 3 / 4 runs) | $2.12, $2.11, $2.09 | $3.65, $2.49, $2.30 (**+33%**) | $1.89, $2.03, $1.93, $2.05 (**−7%**) | |
| 12 turns building a todo app (2 / 2 / 3 runs) | $5.20, $4.43 | $3.43, $3.61 (−27%) | $3.55, $3.54, $3.61 (−26%) | |
| an app, then a related web server, then 3 turns (2 / 1 / 3 runs) | $3.12, $3.09 | $2.79 (−10%) | $2.66, $2.81, $2.96 (−10%) | |
| 3 unrelated small jobs (2 / 2 runs) | $1.81, $1.83 | | | $0.57, $0.50 (**−71%**) |

The switch turn itself, across all related switches measured: compact $0.47 to $1.39 (average $0.79, 5 switches), notes $0.33 to $0.34 (4 switches). The turns after a switch cost the same in both modes, so the difference is the switch. On a short chat compacting never earns its cost back and ends up dearer than doing nothing; notes are about break-even after one turn. In the longer chats the judge mixed switch types within a run (a compact and a clear, or two notes switches), so those totals tie. Tests passed in every cli, todo and app run. A bakery-site scenario was dropped from the totals because the judge switched in only 3 of 6 runs, at different turns.

### Coming back after a long break (0.14.1)

A seeded chat (about 100k tokens of conversation) whose last reply was moved 3 hours into the past, then 3 work turns, ghosted_ off and on:

| Run | Off | On | Fresh start with notes |
|---|---|---|---|
| 3 | $1.61 | $0.61 | yes |
| 5 | $1.70 | $1.73 | no |
| 6 | $1.61 | $0.81 | yes |
| 7 | $1.76 | $1.82 | no |
| 8 | $1.64 | $1.70 | no |
| Average | $1.66 | $1.33 (−20%) | |

When the fresh start fires it saves 50 to 62%, because the first turn no longer rewrites the expired cache ($1.13 down to about $0.40). The three misses were the same first prompt ("Add a clear-done command…"), which the judge scores 9 for depending on the last messages, and the 0.14.1 rule kept the chat at 9 or more. 0.14.2 keeps it only at 10, which would have fired in all five runs; quick follow-ups such as "keep going" skip the judge and still keep the chat. The first turn after a fresh start takes about 15 seconds longer while the notes are written.

## Live cost, open chats (0.13.2, Opus 5.5)

The same scripted chat run with ghosted_ off and on, two runs each, Claude Code (Opus 5.5) in hidden terminals with the cache warm the whole time. Each chat starts by reading two large standard-library files (about 100k tokens of conversation on top of about 110k of fixed context), then switches to new work. Costs are priced from the API usage in the transcripts plus what `/cost` reported for the rest of the session; tests passed in every run.

| Chat after the reading | Off | On | Cost | Wall time |
|---|---|---|---|---|
| 12 turns building a todo app | $5.20, $4.43 | $3.73, $4.00 | **−20%** | −4% (517s vs 494s) |
| 3 unrelated small jobs (cleared) | $1.67, $1.68 | $1.63, $1.60 | −3% | same |
| a question, 3 turns of a todo app, a haiku | $2.21, $2.20 | $2.23, $2.12 | −1% | +10% |
| 5 turns of a todo app | $2.30, $2.70 | $2.43, $2.37 | −4% | +2% |

Why less than the 70% below: Opus 5.5 reads cached tokens at $0.20 per million, 5% of the input price, so in a warm chat 100k tokens of old conversation cost about $0.02 per request. A compaction costs about $0.45 (part of the old context sent uncached, the cache rebuilt, a summary written) and 30 to 40 seconds; a clear costs about $0.18 to rebuild the cache. Both pay off only after enough requests: in these chats a few turns are 9 to 15 requests, 12 turns about 35. In the real sessions behind the judge eval, a median of 59 requests followed the moments labelled as switches.

The 36-run benchmark further down resumed seeded chats whose cache had expired, so without ghosted_ the first request wrote 176k tokens to the cache again at twice the input price. That is what coming back to a big chat after an hour costs, and there clearing saved 70%.

## 177 real moments, scored judge (0.13.0)

The earlier real test had 14 prompts, labelled by the author. 0.13 is tuned on a bigger set: 180 prompts typed in 110 of the author's own sessions (Dutch and English, coding, websites, research), each with at least 20k tokens of context. Each was labelled by Opus twice, with hindsight: it saw the conversation, the prompt, and what Claude did next, and judged whether the full chat was needed (same), a summary would do (related) or nothing was needed (new). The two passes agreed on 177: 154 same, 19 related, 4 new. Real use is mostly follow-ups, so a needless switch is the error to avoid. Tuning used two thirds of the cases; the other third was only used to check.

| Judge | Right (of 177) | Wrong clear | Needless compact | Missed switch |
|---|---|---|---|---|
| 0.12 | 148 | 0 | 15 | 14 |
| 0.13 | 157 | 0 | 3 | 16 |

The 0.12 run hit 19 judge errors while Claude Code updated itself mid-run; an error keeps the chat, so 3 of its 14 misses came from that.

What changed:

- **The judge scores instead of picking a label.** It rates how much the request depends on the details of the last few messages (0-10) and how much it needs the earlier conversation at all (0-10). Detail 6 or more keeps the chat, otherwise history 1 or more compacts, otherwise it clears. The thresholds were picked on the training cases and held up on the check cases (train 98.5, check 48.5 against 80 and 46 for 0.12, on a score that counts a needless compact as -1 and a missed switch as -0.5).
- **A new feature, page, document, report, analysis or setup scores at most 5 for detail**, even when it reuses the same files. Without that line, "add password reset using the same session helpers" was kept; with it, 22 and 24 of 25 synthetic prompts were right over two rounds.
- **Low effort.** Haiku now thinks before answering by default. `--effort low` turns that off: on the same question, median 3.2s against 4.7s and about half the output tokens, with the same accuracy. Older Claude Code without the flag falls back to the default.
- **The size check counts what Claude actually sends.** Attached files and skill text are stored outside the messages, so the old estimate saw 2k tokens where the API saw 131k. The check now uses the API's own count minus the session's first request (system prompt, tools, plugins, MCP, memory: a median of 108k tokens in the author's sessions, which `/clear` can't remove). 118 of 177 prompts were judged instead of 89.

**Checked on prompts never used for tuning.** Because the prompt wording was picked after looking at all 177, a second set was built afterwards: 129 other prompts from the same sessions, labelled the same way (both passes agreed on 127: 103 same, 24 related). 0.13.1 includes the follow-up rule below.

| On 127 untouched moments | Right | Wrong clear | Needless compact | Missed switch |
|---|---|---|---|---|
| 0.12 | 92 | 4 | 18 | 13 |
| 0.13.1 | 102 | 0 | 8 | 17 |

4 of the 0.13.1 misses were judge errors, which keep the chat.

**Fewer judge calls (0.13.1).** Skill names and image tags no longer count as words for the follow-up check, so "keep going /caveman" and "do them all /caveman" skip the judge, as do prompts of up to 3 words and a few more verbs ("relaunch", "restart", "keep working"). On the 177 moments that skipped 14 more prompts, all real follow-ups.

Tried and dropped: example anchors in the prompt (no gain, 60% more cost), asking "would a summary do?" instead (more needless compacts), stopping the output early (no speed gain on its own), a pre-started judge process (0.25s faster, not worth a background process), showing the judge more of the chat's start or less of its end (within run-to-run noise), and averaging two or three judge calls (steadier, not better on average, at two or three times the cost).

**Live sessions (0.13.2).** Claude Code (Opus) in hidden terminals through the terminal bridge, real Haiku judge, four scripted sessions. The whole loop worked every time it fired: block, `/compact` or `/clear` typed in, the saved task started on its own and finished (files written, tests run). One wrong call showed up: "Which method prints the usage message…? Answer from what you read." was compacted. 0.13.2 treats a prompt that points back at what Claude just read, wrote or did ("from what you read", "the file you already read", "you just fixed") as a follow-up at any length, without asking the judge: 43 of 44 such prompts in the two real sets were follow-ups, and the one exception only matched inside pasted text, which the check now ignores. Rerun on 0.13.2: both back-reference prompts kept, follow-ups kept ("the order button is too small on phones…", "the tests failed right? fix the bug…"), new features compacted, an unrelated haiku cleared. A changelog entry for "this precedence fix" was kept rather than compacted; a poem right after a compaction was kept because the chat was under the 20k size check.

**Run-to-run noise.** The same judge run three times on both sets scored 138.5 to 144 on the first and 85.5 to 94 on the second (score = right + half of partly right − 2 × wrong clears − needless compacts − half of missed switches). About 13% of judged prompts change answer between runs; a change to the prompt needs to beat that spread before it counts.

**What it saves on real sessions.** Replaying the judge's calls on the 304 sampled prompts against the sessions they came from: every later request in that session sends the removed conversation again unless ghosted_ switched. The judge's switches cut 5.7% of the input tokens that followed (summary requests already subtracted); perfect calls on the same prompts would cut 7.0%. Only the sampled prompts were judged here, so a live session, where every prompt is judged, switches more often. About a third of all input in these sessions was the fixed context every request starts with (system prompt, tools, MCP servers, skills, memory: about 110k tokens), which no compaction can remove.

The real missed switches are mostly new features on the same app that Haiku rates as needing recent detail ("add an icon for the web", "add an online mode"). Lowering the threshold to catch them adds needless compacts at the same rate. Of the 14 older real prompts, 12 were right in both rounds.

## Compact on partial overlap, one model (0.12.0)

0.11 asked Sonnet to confirm every switch. That stopped wrong switches but cost more, took about 6 seconds, and kept the full chat whenever a prompt touched the earlier subject even partly. 0.12 drops the second model and changes the rule: only a request that acts on the work of the last few messages ("push", "check what you skipped", "why did X not do Y") keeps the chat. A new job that touches the same project or subject, even partly, is compacted. When unsure between compact and clear, it compacts.

| Judge | Real moments (14 × 3) | Synthetic (25 × 3) | Typical time | Cost per judged prompt |
|---|---|---|---|---|
| 0.10: Haiku | about 9 wrong switches in 42 | 70 right, 0 wrong | ~3s | ~$0.0002 to $0.0013 |
| 0.11: Haiku, Sonnet on switches | 38 right, 0 wrong, 4 missed | 69 right, 0 wrong | ~3 to 4s; ~6s on a switch | ~$0.001 |
| 0.12: Haiku, compact on overlap | 35 right, 0 missed, 7 off-label | 74 right, 0 wrong | ~4s | ~$0.0007 |

Of the 7 off-label real calls, 4 compacted a prompt labelled "keep" ("check the things you did not check", "do the wins to finish the website", "is ghosted updated on my device"), so the summary was kept. The other 3 were one prompt cleared in all three rounds: "why did ghosted not compress this task", asked in a session about website work. The judge's reason was that the question doesn't need the website work, which is defensible; it was labelled "keep" before the rule change.

## Second opinion on switches (0.11.0)

The 25-prompt synthetic test looked fine, so 0.11 also tests the judge on real moments: 14 prompts from the author's own sessions that the plugin had judged, rebuilt from the transcripts exactly as they were (27k to 401k tokens, Dutch and English, with subagent reports and skill output mixed in). Each was labelled by hand: 3 should switch ("create a momo download and reroll key generator app", "add english mode for the website", a side question after a memory audit), 11 should not ("push", "deploy it when the agent is done", "why did ghosted not compress this task", "skill should be everywhere").

On these, the 0.10 judge (Haiku alone) made 2 to 4 wrong switches per round. Rewriting its rule as two steps (first: does the request act on, ask about or complain about what was just done? then: same project or not?) helped on some rounds but not reliably. Sonnet alone made none, but costs about 10x more per call.

0.11 uses both: Haiku answers first, and most prompts stop there. Only when Haiku wants to switch, Sonnet gets the same question, and the switch happens only if Sonnet agrees. If Sonnet says same, fails or runs out of time, the chat is kept. The judge now also reads only the user and assistant messages: in a 400k agent session, 5,300 of the last 6,000 characters it used to see were tool output.

| Judge | Real moments (14 × 3) | Synthetic (25 × 3) | Typical time | Cost per judged prompt |
|---|---|---|---|---|
| 0.10: Haiku | about 9 wrong switches in 42 | 70 right, 0 wrong | ~3s | ~$0.0002 to $0.0013 |
| 0.11: Haiku, Sonnet on switches | 38 right, 0 wrong switches | 69 right, 0 wrong | ~3 to 4s; ~6s when it switches | ~$0.001 average |

The 4 real misses kept the chat: three times on a quick side question, once on "add english mode for the website". A miss only means less saved; a wrong switch loses context the next prompt needed. 0.12 removed the second opinion.

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

## Measured: clear vs compact vs off, resumed chats with an expired cache (v0.2.0)

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

