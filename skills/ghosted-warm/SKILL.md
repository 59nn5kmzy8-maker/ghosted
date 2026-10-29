---
name: ghosted-warm
description: Sets how long ghosted_ keeps Claude's prompt cache warm after the last turn. No argument means 2h; "90m", "3h" or "off". Use when the user types /ghosted-warm.
argument-hint: "[2h|90m|off]"
---

```bash
node "${CLAUDE_PLUGIN_ROOT}/hooks/ghosted.js" cmd "${CLAUDE_PLUGIN_DATA}" warm <<'GHOSTED_ARGS'
$ARGUMENTS
GHOSTED_ARGS
```

Show the output as is.
