---
name: ghosted-terse
description: Sets ghosted_ terse answers. No argument turns them on (full); "lite" for a lighter style; "off" to turn them off; "auto" to follow caveman. Use when the user types /ghosted-terse.
argument-hint: "[lite|off|auto]"
---

Run with the user's argument on the line between the markers (empty means full):

```bash
node "${CLAUDE_PLUGIN_ROOT}/hooks/ghosted.js" cmd "${CLAUDE_PLUGIN_DATA}" terse <<'GHOSTED_ARGS'
$ARGUMENTS
GHOSTED_ARGS
```

Show the output as is. From your next reply on, write in the level it names; if off, write normally.
