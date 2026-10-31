---
name: ghosted
description: The /ghosted command for the ghosted_ plugin. Bare /ghosted shows status and the commands. Arguments change settings - terse [lite|full|off|auto], warm [<time>|off], setup [off], on, pause, reset, stats, help. Use when the user types /ghosted, asks to change ghosted_ settings, asks what ghosted_ saved, or asks how ghosted_ works (task switches, "new:", "same:", why a prompt was blocked, how to get an old chat back).
argument-hint: "[terse lite|full|off|auto | warm <time>|off | setup [off] | on | pause | stats | reset | help]"
---

Run this with the user's arguments on the line between the markers, then show its output to the user as is. The quoted heredoc keeps the arguments away from the shell.

```bash
node "${CLAUDE_PLUGIN_ROOT}/hooks/ghosted.js" cmd "${CLAUDE_PLUGIN_DATA}" <<'GHOSTED_ARGS'
$ARGUMENTS
GHOSTED_ARGS
```

If the output sets a terse level other than off, write in that style from your next reply on. If it says off, write normally.

How ghosted_ works, for questions:
- Above about 20k tokens of conversation, a Haiku judge looks at each prompt that isn't an obvious follow-up and answers one of three things:
  - same: it continues the current work. Nothing happens.
  - related: a new job on the same project or subject. Haiku writes handoff notes from the old chat, ghosted_ runs `/clear`, then starts the task with the notes (`GHOSTED_RELATED=compact` uses `/compact` instead).
  - new: an unrelated task. ghosted_ runs `/clear`, then starts the task with up to 5 facts from the old work.
- The old conversation is always archived. `/resume` brings back the chat from before a switch; `/ghosted-recall <words>` searches archives (kept 30 days).
- `new: <prompt>` forces a switch; `same: <prompt>` blocks one.
- Cache warming (`/ghosted warm 1h`, default 1h): while the session is idle, a hidden fork of it sends one short turn just before the prompt cache expires, so a break doesn't force a full cache rewrite. Stops when the user is back, when Claude Code exits, or before it costs half the rewrite.
- Terse answers: auto (default) means lite (no filler, full sentences), off when caveman is active. full is compressed notes.
- Auto-typing works in iTerm2, tmux, WezTerm, kitty and Windows consoles; elsewhere (Terminal.app, VS Code terminal, Ghostty, Alacritty) `/ghosted setup` adds a `claude` shell function that runs Claude Code through ghosted_'s terminal bridge. Without it, ghosted_ says which command to run, then the user types `go`.
- Environment variables override everything: `GHOSTED_TERSE`, `GHOSTED_MIN_TOKENS`, `GHOSTED_KEEP_WARM`, `GHOSTED_ARCHIVE_DAYS`, `GHOSTED_MODE=compact`, `GHOSTED_OFF=1`.
