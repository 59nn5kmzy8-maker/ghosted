---
name: ghosted-off
description: Pauses ghosted_ completely (no task switching, terse rules or cache warming) until /ghosted on. Use when the user types /ghosted-off or wants ghosted_ to stop.
---

```bash
node "${CLAUDE_PLUGIN_ROOT}/hooks/ghosted.js" cmd "${CLAUDE_PLUGIN_DATA}" pause </dev/null
```

Show the output as is, and write normally from now on.
