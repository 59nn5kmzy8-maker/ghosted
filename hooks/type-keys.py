#!/usr/bin/env python3
"""Types keystrokes into the Claude Code input of the terminal this process runs in.

Usage: type-keys.py '<json list of [delay_seconds, text]>' [apple-terminal-tty]
TIOCSTI pushes bytes into our controlling tty's input queue, which works in any terminal.
If the OS refuses it, fall back to AppleScript `do script` aimed at the Terminal tab.
"""
import fcntl, json, subprocess, sys, termios, time

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


def tiocsti(fd, text):
    for b in text.encode():
        fcntl.ioctl(fd, termios.TIOCSTI, bytes([b]))


def main():
    steps = json.loads(sys.argv[1])
    tty = sys.argv[2] if len(sys.argv) > 2 else ''
    try:
        tty_file = open('/dev/tty', 'rb', buffering=0)  # keep a reference so the fd stays open
        fd = tty_file.fileno()
    except OSError:
        fd = None
    for delay, text in steps:
        time.sleep(delay)
        if fd is not None:
            try:
                tiocsti(fd, text)
                continue
            except OSError:
                fd = None
        if not tty:
            sys.exit(1)
        subprocess.run(['osascript', '-e', APPLESCRIPT, text, tty], check=False)


if __name__ == '__main__':
    main()
