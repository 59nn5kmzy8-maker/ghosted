---
name: recall
description: Finds earlier work that smart-compact archived when it cleared or compacted the context, and shows a compact digest of it. Use when the user asks about earlier work that is no longer in context ("what did we do with X", "recall", "the earlier task"), or when a carried-over archive path is mentioned.
argument-hint: "<words to search for>"
---

Run this and use its output to answer. Read the archive file it names only if the digest lacks a detail you need.

```bash
node "${CLAUDE_PLUGIN_ROOT}/hooks/smart-compact.js" recall $ARGUMENTS
```
