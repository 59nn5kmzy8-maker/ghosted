# ghosted_ terminal bridge: runs Claude Code in a pseudo-terminal that passes everything through unchanged,
# plus a private pipe that ghosted_'s hooks write keystrokes into (to type /clear and start the next task).
# This makes auto-typing work in any terminal app (VS Code, Ghostty, Alacritty, ...), the way tmux would.
# Usage: python3 ghosted-pty.py <program> [args...]   (the `claude` shell function that /ghosted setup adds)
import errno, fcntl, os, pty, select, signal, struct, sys, tempfile, termios, tty

prog, args = sys.argv[1], sys.argv[2:]
fifo_dir = tempfile.mkdtemp(prefix='ghosted-')
fifo = os.path.join(fifo_dir, 'keys')
os.mkfifo(fifo, 0o600)
os.environ['GHOSTED_PTY_INJECT'] = fifo

pid, master = pty.fork()
if pid == 0:
    try:
        os.execvp(prog, [prog] + args)
    except OSError as e:
        sys.stderr.write(f'ghosted_: cannot start {prog}: {e}\n')
        os._exit(127)

keys = os.open(fifo, os.O_RDWR | os.O_NONBLOCK)  # read-write so it never sees EOF between writers
stdin = sys.stdin.fileno()
is_tty = os.isatty(stdin)


def resize(*_):
    if is_tty:
        try:
            fcntl.ioctl(master, termios.TIOCSWINSZ, fcntl.ioctl(stdin, termios.TIOCGWINSZ, b'\0' * 8))
        except OSError:
            pass


signal.signal(signal.SIGWINCH, resize)
resize()
saved = termios.tcgetattr(stdin) if is_tty else None
if is_tty:
    tty.setraw(stdin)


def write_all(fd, data):
    while data:
        try:
            data = data[os.write(fd, data):]
        except OSError as e:
            if e.errno != errno.EAGAIN:
                raise
            select.select([], [fd], [])


code = 0
try:
    sources = [master, stdin, keys]
    while True:
        try:
            ready, _, _ = select.select(sources, [], [])
        except InterruptedError:
            continue
        if master in ready:
            try:
                data = os.read(master, 65536)
            except OSError:
                data = b''
            if not data:
                break
            write_all(sys.stdout.fileno(), data)
        if stdin in ready:
            data = os.read(stdin, 65536)
            if not data:
                sources.remove(stdin)
            else:
                write_all(master, data)
        if keys in ready:
            try:
                write_all(master, os.read(keys, 65536))
            except BlockingIOError:
                pass
finally:
    if saved:
        termios.tcsetattr(stdin, termios.TCSAFLUSH, saved)
    try:
        _, status = os.waitpid(pid, 0)
        code = os.waitstatus_to_exitcode(status)
    except ChildProcessError:
        pass
    os.close(keys)
    os.unlink(fifo)
    os.rmdir(fifo_dir)
sys.exit(code if code >= 0 else 128 - code)
