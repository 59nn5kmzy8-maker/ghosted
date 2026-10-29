---
name: ghosted-setup
description: Makes ghosted_'s auto-typing work in any terminal (VS Code, Ghostty, Alacritty) by adding a claude shell function that runs Claude Code through ghosted_'s terminal bridge. "off" removes it. Use when the user types /ghosted-setup or ghosted_ said it couldn't type in their terminal.
argument-hint: "[off]"
---

This changes the user's shell config (~/.zshrc, ~/.bashrc or fish). The user asked for it by running this command.

```bash
node "${CLAUDE_PLUGIN_ROOT}/hooks/ghosted.js" cmd "${CLAUDE_PLUGIN_DATA}" setup <<'GHOSTED_ARGS'
$ARGUMENTS
GHOSTED_ARGS
```

Show the output as is.
