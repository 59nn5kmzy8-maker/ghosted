---
name: ghosted
description: The /ghosted command for the ghosted_ plugin. Sets terse answers (full, lite, auto, off), mid-run compaction (max <tokens>), pause or resume, and shows stats or help. Use when the user types /ghosted, asks to change ghosted_ settings, asks what ghosted_ saved, or asks how ghosted_ works (task switches, "new:", "same:", why a prompt was blocked).
argument-hint: "[full|lite|auto|off|max <tokens>|pause|resume|stats|reset|help]"
---

Run this with the user's arguments on the line between the markers, then show its output to the user as is. The quoted heredoc keeps the arguments away from the shell.

```bash
node "${CLAUDE_PLUGIN_ROOT}/hooks/ghosted.js" cmd "${CLAUDE_PLUGIN_DATA}" <<'GHOSTED_ARGS'
$ARGUMENTS
GHOSTED_ARGS
```

If the output sets a terse level other than off, write in that style from your next reply on. If it says off, write normally.

How ghosted_ works, for questions:
- When a prompt starts a new, unrelated task (a Haiku judge decides, only above about 20k tokens of context), ghosted_ archives the old conversation, runs `/clear`, restores the prompt and types "Start the pending task." Up to 5 facts from the old work come along.
- `new: <prompt>` forces a switch; `same: <prompt>` blocks one.
- Mid-run compaction (off unless set): past the limit, the run stops, `/compact` runs, then "Continue where you left off." is typed.
- Old conversations are archived; `/ghosted:recall <words>` finds them.
- Auto-typing works in macOS Terminal.app and Windows consoles; elsewhere ghosted_ says which command to run, then the user types `go`.
- Environment variables override everything: `GHOSTED_TERSE`, `GHOSTED_MAX_CONTEXT`, `GHOSTED_MIN_TOKENS`, `GHOSTED_MODE=compact`, `GHOSTED_OFF=1`.
