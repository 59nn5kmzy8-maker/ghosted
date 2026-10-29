# Windows counterpart of warm-pty.py: runs a program in a hidden pseudo console (ConPTY) and types one
# message once it has fully loaded. Used by ghosted.js for cache warming.
# Usage: warm-pty.ps1 -Job <base64 of UTF-8 json {"delay": seconds, "message": text, "exe": program, "args": [...]}>
# (base64 because Windows command-line quoting mangles the quotes inside JSON)
param([string]$Job)

$j = [Text.Encoding]::UTF8.GetString([Convert]::FromBase64String($Job)) | ConvertFrom-Json

Add-Type -TypeDefinition @'
using System;
using System.IO;
using System.Text;
using System.Threading;
using System.Runtime.InteropServices;
using Microsoft.Win32.SafeHandles;

public static class Pty {
    [StructLayout(LayoutKind.Sequential)] struct COORD { public short X, Y; }
    [StructLayout(LayoutKind.Sequential, CharSet = CharSet.Unicode)]
    struct STARTUPINFO {
        public int cb; public string lpReserved, lpDesktop, lpTitle;
        public int dwX, dwY, dwXSize, dwYSize, dwXCountChars, dwYCountChars, dwFillAttribute, dwFlags;
        public short wShowWindow, cbReserved2; public IntPtr lpReserved2, hStdInput, hStdOutput, hStdError;
    }
    [StructLayout(LayoutKind.Sequential)] struct STARTUPINFOEX { public STARTUPINFO StartupInfo; public IntPtr lpAttributeList; }
    [StructLayout(LayoutKind.Sequential)] struct PROCESS_INFORMATION { public IntPtr hProcess, hThread; public int dwProcessId, dwThreadId; }

    [DllImport("kernel32.dll", SetLastError = true)] static extern bool CreatePipe(out SafeFileHandle r, out SafeFileHandle w, IntPtr sa, int size);
    [DllImport("kernel32.dll", SetLastError = true)] static extern int CreatePseudoConsole(COORD size, SafeFileHandle input, SafeFileHandle output, uint flags, out IntPtr hpc);
    [DllImport("kernel32.dll", SetLastError = true)] static extern void ClosePseudoConsole(IntPtr hpc);
    [DllImport("kernel32.dll", SetLastError = true)] static extern bool InitializeProcThreadAttributeList(IntPtr list, int count, int flags, ref IntPtr size);
    [DllImport("kernel32.dll", SetLastError = true)] static extern bool UpdateProcThreadAttribute(IntPtr list, uint flags, IntPtr attr, IntPtr value, IntPtr size, IntPtr prev, IntPtr retSize);
    [DllImport("kernel32.dll", SetLastError = true, CharSet = CharSet.Unicode)]
    static extern bool CreateProcess(string app, StringBuilder cmd, IntPtr pa, IntPtr ta, bool inherit, uint flags, IntPtr env, string dir, ref STARTUPINFOEX si, out PROCESS_INFORMATION pi);
    [DllImport("kernel32.dll", SetLastError = true)] static extern bool TerminateProcess(IntPtr h, uint code);

    const uint EXTENDED_STARTUPINFO_PRESENT = 0x00080000, CREATE_UNICODE_ENVIRONMENT = 0x00000400;
    static readonly IntPtr PSEUDOCONSOLE = (IntPtr)0x00020016;

    public static void Run(string cmdline, string dir, double delay, string message) {
        SafeFileHandle inRead, inWrite, outRead, outWrite;
        if (!CreatePipe(out inRead, out inWrite, IntPtr.Zero, 0) || !CreatePipe(out outRead, out outWrite, IntPtr.Zero, 0)) throw new Exception("CreatePipe failed");
        IntPtr hpc;
        int hr = CreatePseudoConsole(new COORD { X = 140, Y = 50 }, inRead, outWrite, 0, out hpc);
        if (hr != 0) throw new Exception("CreatePseudoConsole failed: " + hr);

        var si = new STARTUPINFOEX();
        si.StartupInfo.cb = Marshal.SizeOf(typeof(STARTUPINFOEX));
        // Without this the child inherits our redirected std handles instead of attaching to the pseudo console.
        si.StartupInfo.dwFlags = 0x00000100; // STARTF_USESTDHANDLES, all handles left null
        IntPtr size = IntPtr.Zero;
        InitializeProcThreadAttributeList(IntPtr.Zero, 1, 0, ref size);
        si.lpAttributeList = Marshal.AllocHGlobal(size);
        if (!InitializeProcThreadAttributeList(si.lpAttributeList, 1, 0, ref size)
            || !UpdateProcThreadAttribute(si.lpAttributeList, 0, PSEUDOCONSOLE, hpc, (IntPtr)IntPtr.Size, IntPtr.Zero, IntPtr.Zero))
            throw new Exception("attribute list failed");
        PROCESS_INFORMATION pi;
        if (!CreateProcess(null, new StringBuilder(cmdline), IntPtr.Zero, IntPtr.Zero, false,
                EXTENDED_STARTUPINFO_PRESENT | CREATE_UNICODE_ENVIRONMENT, IntPtr.Zero, dir, ref si, out pi))
            throw new Exception("CreateProcess failed: " + Marshal.GetLastWin32Error());

        var input = new FileStream(inWrite, FileAccess.Write);
        var output = new FileStream(outRead, FileAccess.Read);
        // Drain the screen output (a full pipe would stall the program) and answer cursor position queries.
        new Thread(() => {
            var buf = new byte[65536];
            try {
                int n;
                while ((n = output.Read(buf, 0, buf.Length)) > 0) {
                    if (Encoding.UTF8.GetString(buf, 0, n).Contains("\x1b[6n")) { var r = Encoding.ASCII.GetBytes("\x1b[1;1R"); input.Write(r, 0, r.Length); input.Flush(); }
                }
            } catch { }
        }) { IsBackground = true }.Start();

        Thread.Sleep(TimeSpan.FromSeconds(delay));
        var msg = Encoding.UTF8.GetBytes(message);
        input.Write(msg, 0, msg.Length); input.Flush();
        Thread.Sleep(2500); // a CR that arrives with pasted text is inserted, not submitted
        input.WriteByte(13); input.Flush();
        Thread.Sleep(600000); // ghosted.js stops us once the reply is in the transcript
        TerminateProcess(pi.hProcess, 0);
        ClosePseudoConsole(hpc);
    }
}
'@

# Windows command-line quoting for one argument.
function Quote([string]$a) {
    if ($a -ne '' -and $a -notmatch '[\s"]') { return $a }
    return '"' + ($a -replace '(\\*)"', '$1$1\"' -replace '(\\+)$', '$1$1') + '"'
}

$exe = $j.exe
if ($exe -notmatch '[\\/]') { $exe = (Get-Command $exe -CommandType Application -ErrorAction Stop | Select-Object -First 1).Source }
$cmd = (@($exe) + @($j.args) | ForEach-Object { Quote $_ }) -join ' '
# npm installs claude as a .cmd shim, which needs cmd.exe to run
if ($exe -match '\.(cmd|bat)$') { $cmd = 'cmd.exe /d /s /c "' + $cmd + '"' }
[Pty]::Run($cmd, (Get-Location).Path, [double]$j.delay, [string]$j.message)
