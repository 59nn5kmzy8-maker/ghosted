---
name: smart-compact
description: Explains the smart-compact plugin, which frees context (/clear by default, or /compact) when the user switches to a new task and then starts that task. Use when the user asks about smart-compact, "new:", "same:", why a prompt was blocked for compaction, or how to tune or turn it off.
---

# smart-compact

When a prompt starts a new, unrelated task, smart-compact blocks it, runs `/clear` (or `/compact` in compact mode), then sends "Start the pending task." The saved prompt, carried-over facts and the archive path are injected afterwards, so Claude starts the task with clean context.

- `new: <prompt>`: compact now, without asking the judge.
- `same: <prompt>`: never compact for this prompt.
- The judge (Haiku through `claude -p`) only runs when context since the last compaction is above `SMART_COMPACT_MIN_TOKENS` (default 20000, estimated as characters / 4).
- `SMART_COMPACT_OFF=1` turns the plugin off. Set env vars in `~/.claude/settings.json` under `"env"`.
- `SMART_COMPACT_MODE=compact` uses `/compact` instead of the default `/clear`: it keeps a summary but cost about twice as much in tests (clear saved 70%, compact 34%).
- Every switch archives the old conversation to `${CLAUDE_PLUGIN_DATA}/archive/` and, when the caveman CLI is installed, indexes it with `caveman mem remember`. Find old work with `caveman mem recall <words>`, then read the archive file.
- Auto-typing works in macOS Terminal.app and in Windows consoles. Elsewhere the block message says to run the command yourself and then type `go`.
- Saved tasks live in `${CLAUDE_PLUGIN_DATA}/pending/` and expire after 10 minutes.
