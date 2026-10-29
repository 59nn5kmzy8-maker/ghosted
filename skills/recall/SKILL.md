---
name: recall
description: Finds earlier work that ghosted archived when it cleared or compacted the context, and shows a compact digest of it. Use when the user asks about earlier work that is no longer in context ("what did we do with X", "recall", "the earlier task"), or when a carried-over archive path is mentioned.
argument-hint: "<words to search for>"
---

Run this with the search words on the line between the markers, then answer from its output. Read the archive file it names only if the digest lacks a detail you need. The quoted heredoc keeps the words away from the shell.

```bash
node "${CLAUDE_PLUGIN_ROOT}/hooks/ghosted.js" recall "${CLAUDE_PLUGIN_DATA}" <<'GHOSTED_WORDS'
$ARGUMENTS
GHOSTED_WORDS
```
