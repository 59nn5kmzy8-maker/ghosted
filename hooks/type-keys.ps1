# Types keystrokes into the console Claude Code runs in (Windows).
# Hooks may run without a console, so attach to the console of the nearest ancestor that has one,
# then write key events into its input buffer with WriteConsoleInput (no window focus needed).
# Usage: type-keys.ps1 -Steps <base64 of UTF-8 json [[delaySeconds, text], ...]> -Pids '<ancestor pids, nearest first>'
# (base64 because Windows command-line quoting mangles the quotes inside JSON)
param([string]$Steps, [string]$Pids)

Add-Type -TypeDefinition @'
using System;
using System.Runtime.InteropServices;

public static class Keys {
    [StructLayout(LayoutKind.Explicit, CharSet = CharSet.Unicode)]
    struct KEY_EVENT_RECORD {
        [FieldOffset(0)] public int bKeyDown;
        [FieldOffset(4)] public ushort wRepeatCount;
        [FieldOffset(6)] public ushort wVirtualKeyCode;
        [FieldOffset(8)] public ushort wVirtualScanCode;
        [FieldOffset(10)] public char UnicodeChar;
        [FieldOffset(12)] public uint dwControlKeyState;
    }
    [StructLayout(LayoutKind.Explicit)]
    struct INPUT_RECORD {
        [FieldOffset(0)] public ushort EventType;
        [FieldOffset(4)] public KEY_EVENT_RECORD KeyEvent;
    }

    [DllImport("kernel32.dll", SetLastError = true)] static extern bool FreeConsole();
    [DllImport("kernel32.dll", SetLastError = true)] static extern bool AttachConsole(uint pid);
    [DllImport("kernel32.dll", SetLastError = true, CharSet = CharSet.Unicode)]
    static extern IntPtr CreateFile(string name, uint access, uint share, IntPtr sa, uint disp, uint flags, IntPtr tmpl);
    [DllImport("kernel32.dll", SetLastError = true, CharSet = CharSet.Unicode)]
    static extern bool WriteConsoleInput(IntPtr h, INPUT_RECORD[] recs, uint n, out uint written);

    static IntPtr input = IntPtr.Zero;

    public static bool Attach(string pids) {
        FreeConsole();
        foreach (var p in pids.Split(',')) {
            uint pid;
            if (uint.TryParse(p.Trim(), out pid) && AttachConsole(pid)) {
                // GENERIC_READ|GENERIC_WRITE, FILE_SHARE_READ|FILE_SHARE_WRITE, OPEN_EXISTING
                input = CreateFile("CONIN$", 0xC0000000, 3, IntPtr.Zero, 3, 0, IntPtr.Zero);
                if (input != new IntPtr(-1)) return true;
                FreeConsole();
            }
        }
        return false;
    }

    static INPUT_RECORD Key(char c, ushort vk, uint ctrl, bool down) {
        var r = new INPUT_RECORD();
        r.EventType = 1; // KEY_EVENT
        r.KeyEvent.bKeyDown = down ? 1 : 0;
        r.KeyEvent.wRepeatCount = 1;
        r.KeyEvent.wVirtualKeyCode = vk;
        r.KeyEvent.UnicodeChar = c;
        r.KeyEvent.dwControlKeyState = ctrl;
        return r;
    }

    public static void Type(string text) {
        var recs = new System.Collections.Generic.List<INPUT_RECORD>();
        foreach (char c in text) {
            ushort vk = 0; uint ctrl = 0;
            if (c == '\r') vk = 0x0D;                          // VK_RETURN
            else if (c == '\x03') { vk = 0x43; ctrl = 0x0008; } // Ctrl+C: 'C' with LEFT_CTRL_PRESSED
            recs.Add(Key(c, vk, ctrl, true));
            recs.Add(Key(c, vk, ctrl, false));
        }
        uint written;
        WriteConsoleInput(input, recs.ToArray(), (uint)recs.Count, out written);
    }
}
'@

if (-not [Keys]::Attach($Pids)) { exit 1 }
$json = [Text.Encoding]::UTF8.GetString([Convert]::FromBase64String($Steps))
foreach ($step in (ConvertFrom-Json $json)) {
    Start-Sleep -Milliseconds ([int]([double]$step[0] * 1000))
    [Keys]::Type([string]$step[1])
}
