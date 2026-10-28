#!/usr/bin/env python3
"""Types keystrokes into the Apple Terminal tab whose tty is given.

Usage: type-keys.py '<json list of [delay_seconds, text]>' /dev/ttysNNN
Hooks run without a controlling terminal, so TIOCSTI can't be used; AppleScript `do script` can.
"""
import json, subprocess, sys, time

APPLESCRIPT = '''on run argv
  tell application "Terminal"
    repeat with w in windows
      repeat with t in tabs of w
        if tty of t is (item 2 of argv) then
          do script (item 1 of argv) in t
          return
        end if
      end repeat
    end repeat
  end tell
end run'''

for delay, text in json.loads(sys.argv[1]):
    time.sleep(delay)
    subprocess.run(['osascript', '-e', APPLESCRIPT, text, sys.argv[2]], check=False)
