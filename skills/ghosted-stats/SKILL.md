---
name: ghosted-stats
description: Opens the ghosted_ dashboard in the browser (a local page with task switches, tokens dropped, estimated savings, warm pings, judge spend and searchable archive) and shows the stats in text. Use when the user types /ghosted-stats or asks what ghosted_ did or saved.
---

Run this, then show its output to the user as is:

```bash
node "${CLAUDE_PLUGIN_ROOT}/hooks/ghosted.js" cmd "${CLAUDE_PLUGIN_DATA}" dashboard </dev/null
```
