---
name: smart-compact
description: Explains the smart-compact plugin, which compacts context when the user switches to a new task and then starts that task. Use when the user asks about smart-compact, "!new", "!same", why a prompt was blocked for compaction, or how to tune or turn it off.
---

# smart-compact

When a prompt starts a new, unrelated task, smart-compact blocks it, runs `/compact` focused on the new task, then sends "Start the pending task." The saved prompt is injected after compaction, so Claude starts the task with clean context.

- `!new <prompt>`: compact now, without asking the judge.
- `!same <prompt>`: never compact for this prompt.
- The judge (Haiku through `claude -p`) only runs when context since the last compaction is above `SMART_COMPACT_MIN_TOKENS` (default 20000, estimated as characters / 4).
- `SMART_COMPACT_OFF=1` turns the plugin off. Set env vars in `~/.claude/settings.json` under `"env"`.
- Auto-typing works only in Apple Terminal. Elsewhere the block message says to run `/compact` and then type `go`.
- Saved tasks live in `${CLAUDE_PLUGIN_DATA}/pending/` and expire after 10 minutes.
