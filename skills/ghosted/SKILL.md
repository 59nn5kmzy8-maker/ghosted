---
name: ghosted
description: Explains the ghosted_ plugin, which frees context (/clear by default, or /compact) when the user switches to a new task and then starts that task. Use when the user asks about ghosted, "new:", "same:", why a prompt was blocked for compaction, or how to tune or turn it off.
---

# ghosted_

When a prompt starts a new, unrelated task, ghosted blocks it, runs `/clear` (or `/compact` in compact mode), then sends "Start the pending task." The saved prompt, carried-over facts and the archive path are injected afterwards, so Claude starts the task with clean context.

- `new: <prompt>`: compact now, without asking the judge.
- `same: <prompt>`: never compact for this prompt.
- The judge (Haiku through `claude -p`) only runs when context since the last compaction is above `GHOSTED_MIN_TOKENS` (default 20000, estimated as characters / 4).
- `GHOSTED_OFF=1` turns the plugin off. Set env vars in `~/.claude/settings.json` under `"env"`.
- `GHOSTED_MODE=compact` uses `/compact` instead of the default `/clear`: it keeps a summary but cost about twice as much in tests (clear saved 70%, compact 34%).
- Every switch archives the old conversation to `${CLAUDE_PLUGIN_DATA}/archive/` and lists it in `archive/index.jsonl`. Find old work with `/ghosted:recall <words>`.
- Settings (asked when the plugin is enabled, changed later in `/config`): compact mid-run at N tokens (default 0, off), the minimum context before a new task is judged (20000), and terse answers (full/lite/off, default full). Env vars `GHOSTED_MAX_CONTEXT`, `GHOSTED_MIN_TOKENS` and `GHOSTED_TERSE` override them.
- Mid-run: when the context passes the limit, the run stops, `/compact` runs, then `Continue where you left off.` is typed automatically.
- Auto-typing works in macOS Terminal.app and in Windows consoles. Elsewhere the block message says to run the command yourself and then type `go`.
- Saved tasks live in `${CLAUDE_PLUGIN_DATA}/pending/` and expire after 10 minutes.
