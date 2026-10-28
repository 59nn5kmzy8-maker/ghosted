# smart-compact

A Claude Code plugin that compacts context when you switch to a new task, not when you hit the context limit.

## How it works

1. You send a prompt. A `UserPromptSubmit` hook checks whether there's enough context since the last compaction (default about 20k tokens). If so, Haiku decides whether the prompt is a new task or a continuation.
2. For a new task, the hook saves your prompt, blocks it, and types `/compact Keep only what helps with the next task: <focus>` into your Terminal tab.
3. After compaction, a `SessionStart` hook (matcher `compact`) injects your saved prompt and types `Start the pending task.` Claude then does your task with clean context.

Any error fails open: your prompt goes through as normal.

## Install

```sh
claude plugin marketplace add 59nn5kmzy8-maker/smart-compact
claude plugin install smart-compact@smart-compact
```

To try it without installing, run `claude --plugin-dir ~/smart-compact`.

## Controls

- `new: <prompt>`: force compaction.
- `same: <prompt>`: skip it.
- `SMART_COMPACT_MIN_TOKENS`: the size threshold.
- `SMART_COMPACT_OFF=1`: turn the plugin off.

## Known limits

- Auto-typing only works in Apple Terminal, through AppleScript `do script` aimed at your tab's tty. It doesn't focus or raise the window. In other terminals the block message asks you to run `/compact` and then type `go`. The task is still restored.
- macOS asks once for permission to let the hook control Terminal. Allow it in that dialog.
- Each judged prompt adds about 5s, because `claude -p` starts a new process.
- The transcript's `compact_boundary` marker isn't documented. If it changes, the whole transcript counts toward the size check, so the judge just runs more often.

## Measured (Opus, about 34k tokens of earlier context, then one small unrelated task)

| | Time | Cost |
|---|---|---|
| Without plugin | 17s | $1.56 |
| With plugin | about 70s | $2.45, plus $0.005 for the judge |

Bigger context (Opus, about 129k tokens estimated, 269k real, then a 3-turn new task: build a todo CLI with tests, add priorities, add clear-done):

| | Turn times | Total time | Cost |
|---|---|---|---|
| Without plugin | 27s / 29s / 25s | 89s | $4.61 |
| With plugin | 65s / 25s / 17s | 116s | $4.41, plus $0.005 for the judge |

Compaction took about 29s and cut 269k tokens to 21k. The plugin is ahead after 3 turns, and each later turn adds to the gap.

For a single short task right after the switch, compaction costs more than it saves. Compaction runs on the main model and rewrites the prompt cache. The savings come from the many later turns that no longer carry the old context.

- With `--fork-session`, the first prompt is never judged, because the new transcript is still empty at that point.

## Test

```sh
node --test
```
