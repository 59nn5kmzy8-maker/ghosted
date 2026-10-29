# Runs Claude Code in a hidden pseudo-terminal and types one message once it has fully loaded.
# Used by ghosted.js for cache warming: usage: warm-pty.py <delay-seconds> <message> <program> <args...>
# Typing after a delay (instead of passing the message as an argument) lets MCP and claude.ai tools
# load first, so the request carries the same tool list as the session and hits its cache.
import os, pty, select, signal, struct, sys, time, fcntl, termios

delay, message, prog, args = float(sys.argv[1]), sys.argv[2], sys.argv[3], sys.argv[4:]
pid, fd = pty.fork()
if pid == 0:
    os.execvp(prog, [prog] + args)
fcntl.ioctl(fd, termios.TIOCSWINSZ, struct.pack('HHHH', 50, 140, 0, 0))
signal.signal(signal.SIGTERM, lambda *_: (os.kill(pid, signal.SIGKILL), sys.exit(0)))


def pump(seconds):
    end = time.time() + seconds
    while time.time() < end:
        r, _, _ = select.select([fd], [], [], 0.2)
        if not r:
            continue
        try:
            data = os.read(fd, 65536)
        except OSError:
            sys.exit(0)
        if not data:
            sys.exit(0)
        if b'\x1b[6n' in data:  # cursor position query: answer like a real terminal
            os.write(fd, b'\x1b[1;1R')


pump(delay)
os.write(fd, message.encode())
pump(2.5)  # a CR that arrives with pasted text is inserted, not submitted
os.write(fd, b'\r')
pump(600)  # ghosted.js stops us once the reply is in the transcript
os.kill(pid, signal.SIGKILL)
