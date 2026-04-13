$ErrorActionPreference = 'Stop'

Add-Type -TypeDefinition @"
using System;
using System.Collections.Concurrent;
using System.Runtime.InteropServices;
using System.Text;
using System.Threading;

public static class Win32Automation {
    private delegate bool EnumWindowsProc(IntPtr hWnd, IntPtr lParam);

    [StructLayout(LayoutKind.Sequential)]
    private struct INPUT {
        public UInt32 type;
        public InputUnion U;
    }

    [StructLayout(LayoutKind.Explicit)]
    private struct InputUnion {
        [FieldOffset(0)]
        public MOUSEINPUT mi;
        [FieldOffset(0)]
        public KEYBDINPUT ki;
    }

    [StructLayout(LayoutKind.Sequential)]
    private struct MOUSEINPUT {
        public Int32 dx;
        public Int32 dy;
        public UInt32 mouseData;
        public UInt32 dwFlags;
        public UInt32 time;
        public IntPtr dwExtraInfo;
    }

    [StructLayout(LayoutKind.Sequential)]
    private struct KEYBDINPUT {
        public UInt16 wVk;
        public UInt16 wScan;
        public UInt32 dwFlags;
        public UInt32 time;
        public IntPtr dwExtraInfo;
    }

    [DllImport("user32.dll")]
    private static extern bool EnumWindows(EnumWindowsProc enumProc, IntPtr lParam);

    [DllImport("user32.dll", CharSet = CharSet.Unicode)]
    private static extern int GetWindowText(IntPtr hWnd, StringBuilder text, int count);

    [DllImport("user32.dll", CharSet = CharSet.Unicode)]
    private static extern int GetWindowTextLength(IntPtr hWnd);

    [DllImport("user32.dll")]
    private static extern bool IsWindowVisible(IntPtr hWnd);

    [DllImport("user32.dll")]
    private static extern IntPtr GetForegroundWindow();

    [DllImport("user32.dll")]
    private static extern bool SetForegroundWindow(IntPtr hWnd);

    [DllImport("user32.dll")]
    private static extern bool BringWindowToTop(IntPtr hWnd);

    [DllImport("user32.dll")]
    private static extern IntPtr SetFocus(IntPtr hWnd);

    [DllImport("user32.dll")]
    private static extern IntPtr SetActiveWindow(IntPtr hWnd);

    [DllImport("user32.dll")]
    private static extern uint GetWindowThreadProcessId(IntPtr hWnd, IntPtr processId);

    [DllImport("kernel32.dll")]
    private static extern uint GetCurrentThreadId();

    [DllImport("user32.dll")]
    private static extern bool AttachThreadInput(uint idAttach, uint idAttachTo, bool fAttach);

    [DllImport("user32.dll")]
    private static extern bool ShowWindowAsync(IntPtr hWnd, int nCmdShow);

    [DllImport("user32.dll")]
    private static extern bool IsIconic(IntPtr hWnd);

    [DllImport("user32.dll")]
    private static extern bool GetWindowRect(IntPtr hWnd, out RECT lpRect);

    [DllImport("user32.dll")]
    private static extern bool GetCursorPos(out POINT lpPoint);

    [DllImport("user32.dll")]
    private static extern bool ScreenToClient(IntPtr hWnd, ref POINT lpPoint);

    [DllImport("user32.dll", SetLastError = true)]
    private static extern IntPtr SendMessage(IntPtr hWnd, UInt32 Msg, UIntPtr wParam, IntPtr lParam);

    [DllImport("user32.dll")]
    private static extern short GetAsyncKeyState(int vKey);

    [DllImport("user32.dll")]
    private static extern void mouse_event(UInt32 dwFlags, UInt32 dx, UInt32 dy, UInt32 dwData, UIntPtr dwExtraInfo);

    [DllImport("user32.dll", SetLastError = true)]
    private static extern UInt32 SendInput(UInt32 nInputs, INPUT[] pInputs, int cbSize);

    private const UInt32 INPUT_MOUSE = 0;
    private const UInt32 INPUT_KEYBOARD = 1;
    private const UInt32 MOUSEEVENTF_LEFTDOWN = 0x0002;
    private const UInt32 MOUSEEVENTF_LEFTUP = 0x0004;
    private const UInt32 MOUSEEVENTF_RIGHTDOWN = 0x0008;
    private const UInt32 MOUSEEVENTF_RIGHTUP = 0x0010;
    private const UInt32 KEYEVENTF_KEYUP = 0x0002;
    private const UInt16 VK_MENU = 0x12;
    private const int SW_RESTORE = 9;
    private const UInt32 WM_LBUTTONDOWN = 0x0201;
    private const UInt32 WM_LBUTTONUP = 0x0202;
    private const UInt32 WM_MOUSEMOVE = 0x0200;
    private const UInt32 WM_RBUTTONDOWN = 0x0204;
    private const UInt32 WM_RBUTTONUP = 0x0205;
    private const UInt32 MK_LBUTTON = 0x0001;
    private const UInt32 MK_RBUTTON = 0x0002;

    [StructLayout(LayoutKind.Sequential)]
    public struct RECT {
        public Int32 Left;
        public Int32 Top;
        public Int32 Right;
        public Int32 Bottom;
    }

    [StructLayout(LayoutKind.Sequential)]
    public struct POINT {
        public Int32 X;
        public Int32 Y;
    }

    public static IntPtr FindWindowByTitleContains(string pattern) {
        if (String.IsNullOrWhiteSpace(pattern)) {
            return IntPtr.Zero;
        }

        IntPtr result = IntPtr.Zero;
        EnumWindows(delegate (IntPtr hWnd, IntPtr lParam) {
            if (!IsWindowVisible(hWnd)) {
                return true;
            }

            string title = GetWindowTitle(hWnd);
            if (!String.IsNullOrEmpty(title) && title.IndexOf(pattern, StringComparison.OrdinalIgnoreCase) >= 0) {
                result = hWnd;
                return false;
            }

            return true;
        }, IntPtr.Zero);

        return result;
    }

    public static string GetWindowTitle(IntPtr hWnd) {
        int length = GetWindowTextLength(hWnd);
        if (length <= 0) {
            return String.Empty;
        }

        StringBuilder builder = new StringBuilder(length + 1);
        GetWindowText(hWnd, builder, builder.Capacity);
        return builder.ToString();
    }

    public static bool IsForeground(IntPtr hWnd) {
        return hWnd != IntPtr.Zero && hWnd == GetForegroundWindow();
    }

    public static bool ActivateWindow(IntPtr hWnd) {
        if (hWnd == IntPtr.Zero) {
            return false;
        }

        if (IsIconic(hWnd)) {
            ShowWindowAsync(hWnd, SW_RESTORE);
        }

        IntPtr foregroundWindow = GetForegroundWindow();
        uint currentThread = GetCurrentThreadId();
        uint foregroundThread = foregroundWindow == IntPtr.Zero ? currentThread : GetWindowThreadProcessId(foregroundWindow, IntPtr.Zero);
        uint targetThread = GetWindowThreadProcessId(hWnd, IntPtr.Zero);
        bool attachedForeground = false;
        bool attachedTarget = false;

        try {
            if (foregroundThread != 0 && foregroundThread != currentThread) {
                attachedForeground = AttachThreadInput(currentThread, foregroundThread, true);
            }
            if (targetThread != 0 && targetThread != currentThread && targetThread != foregroundThread) {
                attachedTarget = AttachThreadInput(currentThread, targetThread, true);
            }

            BringWindowToTop(hWnd);
            SetActiveWindow(hWnd);
            SetFocus(hWnd);
            SetForegroundWindow(hWnd);

            if (IsForeground(hWnd)) {
                return true;
            }

            KeyDown(VK_MENU);
            KeyUp(VK_MENU);
            BringWindowToTop(hWnd);
            SetActiveWindow(hWnd);
            SetFocus(hWnd);
            SetForegroundWindow(hWnd);
            return IsForeground(hWnd);
        }
        finally {
            if (attachedTarget) {
                AttachThreadInput(currentThread, targetThread, false);
            }
            if (attachedForeground) {
                AttachThreadInput(currentThread, foregroundThread, false);
            }
        }
    }

    public static RECT GetRect(IntPtr hWnd) {
        RECT rect;
        if (!GetWindowRect(hWnd, out rect)) {
            return new RECT();
        }
        return rect;
    }

    public static bool IsVirtualKeyDown(int vKey) {
        return (GetAsyncKeyState(vKey) & 0x8000) != 0;
    }

    public static string LeftClick() {
        SendMouse(MOUSEEVENTF_LEFTDOWN, MOUSEEVENTF_LEFTUP);
        return "send-input";
    }

    public static string RightClick() {
        SendMouse(MOUSEEVENTF_RIGHTDOWN, MOUSEEVENTF_RIGHTUP);
        return "send-input";
    }

    public static string LeftClickWindow(IntPtr hWnd) {
        if (TrySendWindowClick(hWnd, false)) {
            return "window-message";
        }

        return LeftClick();
    }

    public static string RightClickWindow(IntPtr hWnd) {
        if (TrySendWindowClick(hWnd, true)) {
            return "window-message";
        }

        return RightClick();
    }

    public static POINT GetCursorPosition() {
        POINT point;
        if (!GetCursorPos(out point)) {
            return new POINT();
        }

        return point;
    }

    public static void KeyTap(UInt16 vk) {
        KeyDown(vk);
        KeyUp(vk);
    }

    public static void KeyDown(UInt16 vk) {
        INPUT[] inputs = new INPUT[] {
            new INPUT {
                type = INPUT_KEYBOARD,
                U = new InputUnion { ki = new KEYBDINPUT { wVk = vk, wScan = 0, dwFlags = 0, time = 0, dwExtraInfo = IntPtr.Zero } }
            }
        };
        SendInput((UInt32)inputs.Length, inputs, Marshal.SizeOf(typeof(INPUT)));
    }

    public static void KeyUp(UInt16 vk) {
        INPUT[] inputs = new INPUT[] {
            new INPUT {
                type = INPUT_KEYBOARD,
                U = new InputUnion { ki = new KEYBDINPUT { wVk = vk, wScan = 0, dwFlags = KEYEVENTF_KEYUP, time = 0, dwExtraInfo = IntPtr.Zero } }
            }
        };
        SendInput((UInt32)inputs.Length, inputs, Marshal.SizeOf(typeof(INPUT)));
    }

    private static void SendMouse(UInt32 downFlag, UInt32 upFlag) {
        INPUT[] downInput = new INPUT[] {
            new INPUT {
                type = INPUT_MOUSE,
                U = new InputUnion { mi = new MOUSEINPUT { dx = 0, dy = 0, mouseData = 0, dwFlags = downFlag, time = 0, dwExtraInfo = IntPtr.Zero } }
            }
        };
        INPUT[] upInput = new INPUT[] {
            new INPUT {
                type = INPUT_MOUSE,
                U = new InputUnion { mi = new MOUSEINPUT { dx = 0, dy = 0, mouseData = 0, dwFlags = upFlag, time = 0, dwExtraInfo = IntPtr.Zero } }
            }
        };
        SendInput((UInt32)downInput.Length, downInput, Marshal.SizeOf(typeof(INPUT)));
        Thread.Sleep(8);
        SendInput((UInt32)upInput.Length, upInput, Marshal.SizeOf(typeof(INPUT)));
    }

    private static void SendMouseCompat(UInt32 downFlag, UInt32 upFlag) {
        mouse_event(downFlag, 0, 0, 0, UIntPtr.Zero);
        mouse_event(upFlag, 0, 0, 0, UIntPtr.Zero);
    }

    private static bool TrySendWindowClick(IntPtr hWnd, bool rightButton) {
        if (hWnd == IntPtr.Zero) {
            return false;
        }

        POINT point;
        if (!GetCursorPos(out point)) {
            return false;
        }

        if (!ScreenToClient(hWnd, ref point)) {
            return false;
        }

        IntPtr lParam = (IntPtr)(((point.Y & 0xFFFF) << 16) | (point.X & 0xFFFF));
        UInt32 downMessage = rightButton ? WM_RBUTTONDOWN : WM_LBUTTONDOWN;
        UInt32 upMessage = rightButton ? WM_RBUTTONUP : WM_LBUTTONUP;
        UIntPtr buttonState = (UIntPtr)(rightButton ? MK_RBUTTON : MK_LBUTTON);

        SendMessage(hWnd, WM_MOUSEMOVE, UIntPtr.Zero, lParam);
        SendMessage(hWnd, downMessage, buttonState, lParam);
        Thread.Sleep(8);
        SendMessage(hWnd, upMessage, UIntPtr.Zero, lParam);
        return true;
    }
}

public sealed class StdinPump {
    private readonly ConcurrentQueue<string> _queue = new ConcurrentQueue<string>();
    private readonly Thread _thread;
    private volatile bool _completed;
    private volatile string _errorMessage = String.Empty;

    public StdinPump() {
        _thread = new Thread(ReadLoop);
        _thread.IsBackground = true;
        _thread.Start();
    }

    private void ReadLoop() {
        try {
            string line;
            while ((line = Console.In.ReadLine()) != null) {
                _queue.Enqueue(line);
            }
        }
        catch (Exception ex) {
            _errorMessage = ex.Message ?? String.Empty;
        }
        finally {
            _completed = true;
        }
    }

    public bool TryDequeue(out string line) {
        return _queue.TryDequeue(out line);
    }

    public bool IsCompleted {
        get { return _completed; }
    }

    public string ErrorMessage {
        get { return _errorMessage ?? String.Empty; }
    }
}
"@

$script:Config = @{
    heartbeatIntervalMs = 10000
    target = @{
        windowTitlePattern = 'ClassicConquer'
        requireForegroundForInput = $true
    }
    runtime = @{
        masterEnabled = $false
        leftClickerEnabled = $false
        rightClickerEnabled = $false
        f7Enabled = $false
        leftClickIntervalMs = 80
        rightClickIntervalMs = 120
        f7IntervalMs = 500
        jitterPercent = 15
        shiftHeldEnabled = $false
        ctrlHeldEnabled = $false
        safeStopReleasesModifiers = $true
        clickMode = 'send-input'
    }
    runtimeApplied = @{
        shiftDown = $false
        ctrlDown = $false
        lastLeftAt = 0
        lastRightAt = 0
        lastF7At = 0
        nextLeftOffset = 0
        nextRightOffset = 0
        nextF7Offset = 0
        lastTargetEmitAt = 0
        lastActivityAt = 0
        lastRuntimeBlockReason = ''
        lastLeftTraceAt = 0
        lastRightTraceAt = 0
        lastF7TraceAt = 0
        lastFocusAttemptAt = 0
    }
    hotkeys = @{}
    hotkeyPressed = @{}
}

function Write-Message {
    param(
        [Parameter(Mandatory = $true)][string]$Type,
        [object]$Payload = $null,
        [object]$RequestId = $null
    )

    $message = [ordered]@{ type = $Type }
    if ($null -ne $RequestId -and -not [string]::IsNullOrEmpty([string]$RequestId)) { $message.requestId = [string]$RequestId }
    if ($null -ne $Payload) { $message.payload = $Payload }
    try {
        [Console]::Out.WriteLine(($message | ConvertTo-Json -Compress -Depth 10))
        [Console]::Out.Flush()
    } catch {
        if ($Type -eq 'hello' -or $Type -eq 'error' -or $Type -eq 'result') {
            throw
        }
    }
}

function Write-ErrorMessage {
    param(
        [string]$RequestId,
        [string]$Code,
        [string]$Message,
        [object]$Context = $null
    )

    $payload = [ordered]@{ code = $Code; message = $Message }
    if ($null -ne $Context) { $payload.context = $Context }
    Write-Message -Type 'error' -Payload $payload -RequestId $RequestId
}

function Write-Result {
    param([string]$RequestId, [object]$Payload = $null)
    Write-Message -Type 'result' -Payload $Payload -RequestId $RequestId
}

function Write-LogMessage {
    param([string]$Message, [object]$Details = $null)

    $payload = [ordered]@{ message = $Message }
    if ($null -ne $Details) {
        $payload.details = $Details
    }

    Write-Message -Type 'log' -Payload $payload
}

function Resolve-TargetSearchPatterns {
    $rawPattern = [string]$script:Config.target.windowTitlePattern
    $patterns = New-Object System.Collections.Generic.List[string]

    function Add-TargetPattern {
        param([string]$Value)

        if ([string]::IsNullOrWhiteSpace($Value)) {
            return
        }

        $candidate = $Value.Trim()
        if ($candidate.Length -lt 3) {
            return
        }

        if (-not $patterns.Contains($candidate)) {
            $patterns.Add($candidate)
        }
    }

    Add-TargetPattern $rawPattern

    $trimmed = $rawPattern.Trim()
    $withoutBrackets = $trimmed.Trim('[', ']')
    Add-TargetPattern $withoutBrackets

    foreach ($candidate in @($trimmed, $withoutBrackets)) {
        if ($candidate -match '\s-\s') {
            Add-TargetPattern (($candidate -split '\s-\s', 2)[1])
        }
    }

    Add-TargetPattern 'ClassicConquer'
    return ,$patterns.ToArray()
}

function Resolve-TargetWindow {
    foreach ($pattern in (Resolve-TargetSearchPatterns)) {
        $handle = [Win32Automation]::FindWindowByTitleContains($pattern)
        if ($handle -ne [IntPtr]::Zero) {
            return [ordered]@{
                handle = $handle
                matchedPattern = $pattern
            }
        }
    }

    return [ordered]@{
        handle = [IntPtr]::Zero
        matchedPattern = ''
    }
}

function Get-TargetStatus {
    $configuredPattern = [string]$script:Config.target.windowTitlePattern
    $targetWindow = Resolve-TargetWindow
    $handle = $targetWindow.handle
    $attached = $handle -ne [IntPtr]::Zero
    $title = if ($attached) { [Win32Automation]::GetWindowTitle($handle) } else { '' }
    $isForeground = if ($attached) { [Win32Automation]::IsForeground($handle) } else { $false }
    $rect = if ($attached) { [Win32Automation]::GetRect($handle) } else { $null }

    return [ordered]@{
        attached = $attached
        isForeground = $isForeground
        title = $title
        windowTitlePattern = $configuredPattern
        matchedPattern = if ($attached) { [string]$targetWindow.matchedPattern } else { '' }
        rect = if ($attached) { [ordered]@{ x = $rect.Left; y = $rect.Top; width = ($rect.Right - $rect.Left); height = ($rect.Bottom - $rect.Top) } } else { $null }
    }
}

function Assert-InputAllowed {
    $status = Get-TargetStatus
    if (-not $status.attached) {
        throw [System.InvalidOperationException]::new('No matching target window was found.')
    }
    if ($script:Config.target.requireForegroundForInput -and -not $status.isForeground) {
        throw [System.InvalidOperationException]::new('Target window is not in the foreground.')
    }
    return $status
}

function Focus-TargetWindow {
    $targetWindow = Resolve-TargetWindow
    $handle = $targetWindow.handle
    if ($handle -eq [IntPtr]::Zero) {
        $status = Get-TargetStatus
        return [ordered]@{
            ok = $false
            activated = $false
            target = $status
        }
    }

    $activated = [Win32Automation]::ActivateWindow($handle)
    Start-Sleep -Milliseconds 50
    $status = Get-TargetStatus

    return [ordered]@{
        ok = [bool]$status.attached
        activated = [bool]$activated
        target = $status
    }
}

function Get-CursorSnapshot {
    $point = [Win32Automation]::GetCursorPosition()
    return [ordered]@{
        x = [int]$point.X
        y = [int]$point.Y
    }
}

function Invoke-LeftClickAction {
    param([string]$Reason = 'runtime')

    $targetWindow = Resolve-TargetWindow
    $cursor = Get-CursorSnapshot
    $attached = $targetWindow.handle -ne [IntPtr]::Zero
    $delivery = 'mouse-event'
    $title = ''
    $isForeground = $false

    if ($attached) {
        $title = [Win32Automation]::GetWindowTitle($targetWindow.handle)
        $isForeground = [Win32Automation]::IsForeground($targetWindow.handle)
        if ([string]$script:Config.runtime.clickMode -eq 'window-message') {
            $delivery = [string][Win32Automation]::LeftClickWindow($targetWindow.handle)
        } else {
            $delivery = [string][Win32Automation]::LeftClick()
        }
    } else {
        $delivery = [string][Win32Automation]::LeftClick()
    }

    return [ordered]@{
        action = 'leftClick'
        reason = $Reason
        delivery = $delivery
        attached = $attached
        matchedPattern = if ($attached) { [string]$targetWindow.matchedPattern } else { '' }
        title = $title
        isForeground = $isForeground
        cursor = $cursor
    }
}

function Invoke-RightClickAction {
    param([string]$Reason = 'runtime')

    $targetWindow = Resolve-TargetWindow
    $cursor = Get-CursorSnapshot
    $attached = $targetWindow.handle -ne [IntPtr]::Zero
    $delivery = 'mouse-event'
    $title = ''
    $isForeground = $false

    if ($attached) {
        $title = [Win32Automation]::GetWindowTitle($targetWindow.handle)
        $isForeground = [Win32Automation]::IsForeground($targetWindow.handle)
        if ([string]$script:Config.runtime.clickMode -eq 'window-message') {
            $delivery = [string][Win32Automation]::RightClickWindow($targetWindow.handle)
        } else {
            $delivery = [string][Win32Automation]::RightClick()
        }
    } else {
        $delivery = [string][Win32Automation]::RightClick()
    }

    return [ordered]@{
        action = 'rightClick'
        reason = $Reason
        delivery = $delivery
        attached = $attached
        matchedPattern = if ($attached) { [string]$targetWindow.matchedPattern } else { '' }
        title = $title
        isForeground = $isForeground
        cursor = $cursor
    }
}

function Release-Modifiers {
    foreach ($vk in 0x10, 0x11, 0x12, 0xA0, 0xA1, 0xA2, 0xA3, 0xA4, 0xA5) {
        [Win32Automation]::KeyUp([uint16]$vk)
    }
    $script:Config.runtimeApplied.shiftDown = $false
    $script:Config.runtimeApplied.ctrlDown = $false
}

function Get-TickMs {
    return [Environment]::TickCount
}

function Mark-HelperActivity {
    $script:Config.runtimeApplied.lastActivityAt = Get-TickMs
}

function Get-HelperIdleTimeoutMs {
    $heartbeatIntervalMs = [Math]::Max(1000, [int]$script:Config.heartbeatIntervalMs)
    return [Math]::Max(5000, $heartbeatIntervalMs * 3)
}

function Test-HelperTimedOut {
    $lastActivityAt = [int64]$script:Config.runtimeApplied.lastActivityAt
    if ($lastActivityAt -le 0) {
        return $false
    }

    return ((Get-TickMs) - $lastActivityAt) -ge (Get-HelperIdleTimeoutMs)
}

function Test-RuntimeHasRequestedInput {
    $runtime = $script:Config.runtime
    return [bool]($runtime.leftClickerEnabled -or $runtime.rightClickerEnabled -or $runtime.f7Enabled -or $runtime.shiftHeldEnabled -or $runtime.ctrlHeldEnabled)
}

function Set-RuntimeBlockReason {
    param([string]$Reason, [object]$TargetStatus = $null)

    $previous = [string]$script:Config.runtimeApplied.lastRuntimeBlockReason
    if ($previous -eq $Reason) {
        return
    }

    if ([string]::IsNullOrWhiteSpace($Reason)) {
        if (-not [string]::IsNullOrWhiteSpace($previous)) {
            Write-LogMessage -Message 'Runtime resumed.' -Details @{ target = $TargetStatus }
        }
    } else {
        Write-LogMessage -Message "Runtime paused: $Reason." -Details @{ reason = $Reason; target = $TargetStatus }
    }

    $script:Config.runtimeApplied.lastRuntimeBlockReason = $Reason
}

function Test-TraceWindow {
    param([string]$FieldName, [int64]$Now, [int]$IntervalMs = 1000)

    $lastAt = [int64]$script:Config.runtimeApplied[$FieldName]
    if (($Now - $lastAt) -lt $IntervalMs) {
        return $false
    }

    $script:Config.runtimeApplied[$FieldName] = $Now
    return $true
}

function Test-RuntimeShouldAttemptFocus {
    param([int64]$Now)

    $lastAt = [int64]$script:Config.runtimeApplied.lastFocusAttemptAt
    if (($Now - $lastAt) -lt 350) {
        return $false
    }

    $script:Config.runtimeApplied.lastFocusAttemptAt = $Now
    return $true
}

function Get-JitterOffset {
    param([int]$BaseIntervalMs)

    $pct = [int]$script:Config.runtime.jitterPercent
    if ($pct -le 0 -or $BaseIntervalMs -le 0) {
        return 0
    }

    $limit = [Math]::Round($BaseIntervalMs * ($pct / 100.0))
    if ($limit -le 0) {
        return 0
    }

    return Get-Random -Minimum (-1 * $limit) -Maximum ($limit + 1)
}

function Apply-ModifierState {
    if ($script:Config.runtime.shiftHeldEnabled -and -not $script:Config.runtimeApplied.shiftDown) {
        [Win32Automation]::KeyDown(0x10)
        $script:Config.runtimeApplied.shiftDown = $true
    } elseif (-not $script:Config.runtime.shiftHeldEnabled -and $script:Config.runtimeApplied.shiftDown) {
        [Win32Automation]::KeyUp(0x10)
        $script:Config.runtimeApplied.shiftDown = $false
    }

    if ($script:Config.runtime.ctrlHeldEnabled -and -not $script:Config.runtimeApplied.ctrlDown) {
        [Win32Automation]::KeyDown(0x11)
        $script:Config.runtimeApplied.ctrlDown = $true
    } elseif (-not $script:Config.runtime.ctrlHeldEnabled -and $script:Config.runtimeApplied.ctrlDown) {
        [Win32Automation]::KeyUp(0x11)
        $script:Config.runtimeApplied.ctrlDown = $false
    }
}

function Reset-RuntimeSchedule {
    $now = Get-TickMs
    $script:Config.runtimeApplied.lastLeftAt = $now
    $script:Config.runtimeApplied.lastRightAt = $now
    $script:Config.runtimeApplied.lastF7At = $now
    $script:Config.runtimeApplied.nextLeftOffset = Get-JitterOffset -BaseIntervalMs ([int]$script:Config.runtime.leftClickIntervalMs)
    $script:Config.runtimeApplied.nextRightOffset = Get-JitterOffset -BaseIntervalMs ([int]$script:Config.runtime.rightClickIntervalMs)
    $script:Config.runtimeApplied.nextF7Offset = Get-JitterOffset -BaseIntervalMs ([int]$script:Config.runtime.f7IntervalMs)
}

function Get-RuntimeSnapshot {
    $status = Get-TargetStatus
    return [ordered]@{
        runtime = [ordered]@{
            masterEnabled = [bool]$script:Config.runtime.masterEnabled
            leftClickerEnabled = [bool]$script:Config.runtime.leftClickerEnabled
            rightClickerEnabled = [bool]$script:Config.runtime.rightClickerEnabled
            f7Enabled = [bool]$script:Config.runtime.f7Enabled
            shiftHeldEnabled = [bool]$script:Config.runtime.shiftHeldEnabled
            ctrlHeldEnabled = [bool]$script:Config.runtime.ctrlHeldEnabled
        }
        target = $status
        appliedAt = (Get-Date).ToString('o')
    }
}

function Resolve-VirtualKey {
    param([string]$Binding)

    switch ($Binding) {
        # Mouse
        'MouseMiddle' { return 0x04 }
        'Mouse4'      { return 0x05 }
        'Mouse5'      { return 0x06 }

        # Control keys
        'Backspace'   { return 0x08 }
        'Tab'         { return 0x09 }
        'Enter'       { return 0x0D }
        'Escape'      { return 0x1B }
        'Space'       { return 0x20 }

        # Navigation
        'PageUp'      { return 0x21 }
        'PageDown'    { return 0x22 }
        'End'         { return 0x23 }
        'Home'        { return 0x24 }
        'ArrowLeft'   { return 0x25 }
        'ArrowUp'     { return 0x26 }
        'ArrowRight'  { return 0x27 }
        'ArrowDown'   { return 0x28 }
        'Insert'      { return 0x2D }
        'Delete'      { return 0x2E }

        # Number row 0–9
        '0' { return 0x30 }
        '1' { return 0x31 }
        '2' { return 0x32 }
        '3' { return 0x33 }
        '4' { return 0x34 }
        '5' { return 0x35 }
        '6' { return 0x36 }
        '7' { return 0x37 }
        '8' { return 0x38 }
        '9' { return 0x39 }

        # Letters A–Z
        'A' { return 0x41 }
        'B' { return 0x42 }
        'C' { return 0x43 }
        'D' { return 0x44 }
        'E' { return 0x45 }
        'F' { return 0x46 }
        'G' { return 0x47 }
        'H' { return 0x48 }
        'I' { return 0x49 }
        'J' { return 0x4A }
        'K' { return 0x4B }
        'L' { return 0x4C }
        'M' { return 0x4D }
        'N' { return 0x4E }
        'O' { return 0x4F }
        'P' { return 0x50 }
        'Q' { return 0x51 }
        'R' { return 0x52 }
        'S' { return 0x53 }
        'T' { return 0x54 }
        'U' { return 0x55 }
        'V' { return 0x56 }
        'W' { return 0x57 }
        'X' { return 0x58 }
        'Y' { return 0x59 }
        'Z' { return 0x5A }

        # Numpad 0–9
        'Numpad0' { return 0x60 }
        'Numpad1' { return 0x61 }
        'Numpad2' { return 0x62 }
        'Numpad3' { return 0x63 }
        'Numpad4' { return 0x64 }
        'Numpad5' { return 0x65 }
        'Numpad6' { return 0x66 }
        'Numpad7' { return 0x67 }
        'Numpad8' { return 0x68 }
        'Numpad9' { return 0x69 }

        # Function keys F1–F12
        'F1'  { return 0x70 }
        'F2'  { return 0x71 }
        'F3'  { return 0x72 }
        'F4'  { return 0x73 }
        'F5'  { return 0x74 }
        'F6'  { return 0x75 }
        'F7'  { return 0x76 }
        'F8'  { return 0x77 }
        'F9'  { return 0x78 }
        'F10' { return 0x79 }
        'F11' { return 0x7A }
        'F12' { return 0x7B }

        # Punctuation / symbols
        'Semicolon'    { return 0xBA }
        'Equal'        { return 0xBB }
        'Comma'        { return 0xBC }
        'Minus'        { return 0xBD }
        'Period'       { return 0xBE }
        'Slash'        { return 0xBF }
        'Backquote'    { return 0xC0 }
        'BracketLeft'  { return 0xDB }
        'Backslash'    { return 0xDC }
        'BracketRight' { return 0xDD }
        'Quote'        { return 0xDE }

        default { return $null }
    }
}

function Register-Hotkeys {
    param([object]$Hotkeys)

    $script:Config.hotkeys = @{}
    $script:Config.hotkeyPressed = @{}
    $registered = 0

    if ($null -eq $Hotkeys) {
        return 0
    }

    foreach ($property in $Hotkeys.PSObject.Properties) {
        $entry = $property.Value
        if ($null -eq $entry -or -not $entry.enabled -or [string]::IsNullOrWhiteSpace([string]$entry.binding)) {
            continue
        }

        $vk = Resolve-VirtualKey -Binding ([string]$entry.binding)
        if ($null -eq $vk) {
            continue
        }

        $script:Config.hotkeys[$property.Name] = @{
            id = $property.Name
            binding = [string]$entry.binding
            vk = [int]$vk
            scope = if ($entry.scope) { [string]$entry.scope } else { 'global' }
        }
        $script:Config.hotkeyPressed[$property.Name] = $false
        $registered++
    }

    return $registered
}

function Poll-Hotkeys {
    param([object]$TargetStatus)

    foreach ($hotkey in $script:Config.hotkeys.Values) {
        if ($hotkey.scope -eq 'game-focused' -and -not $TargetStatus.isForeground) {
            $script:Config.hotkeyPressed[$hotkey.id] = $false
            continue
        }

        $isDown = [Win32Automation]::IsVirtualKeyDown([int]$hotkey.vk)
        $wasDown = [bool]$script:Config.hotkeyPressed[$hotkey.id]
        if ($isDown -and -not $wasDown) {
            $script:Config.hotkeyPressed[$hotkey.id] = $true
            Write-Message -Type 'hotkey-triggered' -Payload @{ hotkeyId = $hotkey.id; binding = $hotkey.binding; triggeredAt = (Get-Date).ToString('o') }
        } elseif (-not $isDown -and $wasDown) {
            $script:Config.hotkeyPressed[$hotkey.id] = $false
        }
    }
}

function Invoke-RuntimeTick {
    $runtime = $script:Config.runtime
    $targetStatus = Get-TargetStatus
    $now = Get-TickMs
    if ((Get-TickMs) - $script:Config.runtimeApplied.lastTargetEmitAt -ge 750) {
        $script:Config.runtimeApplied.lastTargetEmitAt = Get-TickMs
        Write-Message -Type 'target-status' -Payload $targetStatus
    }

    Poll-Hotkeys -TargetStatus $targetStatus

    if (-not $runtime.masterEnabled) {
        $shouldRelease = $runtime.safeStopReleasesModifiers -and (
            $script:Config.runtimeApplied.shiftDown -or
            $script:Config.runtimeApplied.ctrlDown -or
            ((Test-RuntimeHasRequestedInput) -and [string]$script:Config.runtimeApplied.lastRuntimeBlockReason -ne 'master-disabled')
        )
        if (Test-RuntimeHasRequestedInput) {
            Set-RuntimeBlockReason -Reason 'master-disabled' -TargetStatus $targetStatus
        } else {
            Set-RuntimeBlockReason -Reason '' -TargetStatus $targetStatus
        }
        if ($shouldRelease) {
            Release-Modifiers
        }
        return
    }

    if (-not $targetStatus.attached) {
        $shouldRelease = $runtime.safeStopReleasesModifiers -and (
            $script:Config.runtimeApplied.shiftDown -or
            $script:Config.runtimeApplied.ctrlDown -or
            [string]$script:Config.runtimeApplied.lastRuntimeBlockReason -ne 'target-not-found'
        )
        Set-RuntimeBlockReason -Reason 'target-not-found' -TargetStatus $targetStatus
        if ($shouldRelease) { Release-Modifiers }
        return
    }

    if ($script:Config.target.requireForegroundForInput -and -not $targetStatus.isForeground) {
        if (Test-RuntimeHasRequestedInput -and Test-RuntimeShouldAttemptFocus -Now $now) {
            $focusResult = Focus-TargetWindow
            $targetStatus = $focusResult.target
            Write-Message -Type 'target-status' -Payload $targetStatus
            Write-LogMessage -Message "Runtime attempted to focus target while active input was waiting." -Details @{ target = $targetStatus; activated = [bool]$focusResult.activated }
        }

        if ($targetStatus.isForeground) {
            Set-RuntimeBlockReason -Reason '' -TargetStatus $targetStatus
        } else {
        $shouldRelease = $runtime.safeStopReleasesModifiers -and (
            $script:Config.runtimeApplied.shiftDown -or
            $script:Config.runtimeApplied.ctrlDown -or
            [string]$script:Config.runtimeApplied.lastRuntimeBlockReason -ne 'target-background'
        )
        Set-RuntimeBlockReason -Reason 'target-background' -TargetStatus $targetStatus
            if ($shouldRelease) { Release-Modifiers }
            return
        }
    }

    Set-RuntimeBlockReason -Reason '' -TargetStatus $targetStatus
    Apply-ModifierState

    if ($runtime.leftClickerEnabled) {
        $leftInterval = [Math]::Max(1, [int]$runtime.leftClickIntervalMs + [int]$script:Config.runtimeApplied.nextLeftOffset)
        if ($now - $script:Config.runtimeApplied.lastLeftAt -ge $leftInterval) {
            $leftResult = Invoke-LeftClickAction -Reason 'runtime'
            $script:Config.runtimeApplied.lastLeftAt = $now
            $script:Config.runtimeApplied.nextLeftOffset = Get-JitterOffset -BaseIntervalMs ([int]$runtime.leftClickIntervalMs)
            if (Test-TraceWindow -FieldName 'lastLeftTraceAt' -Now $now) {
                Write-LogMessage -Message "Runtime left click attempted via $($leftResult.delivery)." -Details $leftResult
            }
        }
    }

    if ($runtime.rightClickerEnabled) {
        $rightInterval = [Math]::Max(1, [int]$runtime.rightClickIntervalMs + [int]$script:Config.runtimeApplied.nextRightOffset)
        if ($now - $script:Config.runtimeApplied.lastRightAt -ge $rightInterval) {
            $rightResult = Invoke-RightClickAction -Reason 'runtime'
            $script:Config.runtimeApplied.lastRightAt = $now
            $script:Config.runtimeApplied.nextRightOffset = Get-JitterOffset -BaseIntervalMs ([int]$runtime.rightClickIntervalMs)
            if (Test-TraceWindow -FieldName 'lastRightTraceAt' -Now $now) {
                Write-LogMessage -Message "Runtime right click attempted via $($rightResult.delivery)." -Details $rightResult
            }
        }
    }

    if ($runtime.f7Enabled) {
        $f7Interval = [Math]::Max(1, [int]$runtime.f7IntervalMs + [int]$script:Config.runtimeApplied.nextF7Offset)
        if ($now - $script:Config.runtimeApplied.lastF7At -ge $f7Interval) {
            [Win32Automation]::KeyTap(0x76)
            $script:Config.runtimeApplied.lastF7At = $now
            $script:Config.runtimeApplied.nextF7Offset = Get-JitterOffset -BaseIntervalMs ([int]$runtime.f7IntervalMs)
            if (Test-TraceWindow -FieldName 'lastF7TraceAt' -Now $now) {
                Write-LogMessage -Message 'Runtime F7 press attempted.' -Details @{ action = 'f7Press'; reason = 'runtime'; target = $targetStatus }
            }
        }
    }
}

function Invoke-TestAction {
    param([string]$Action)

    $prepared = if ($Action -eq 'releaseModifiers') {
        [ordered]@{
            target = Get-TargetStatus
            focusAttempted = $false
            focusResult = $null
        }
    } else {
        $status = Get-TargetStatus
        if (-not $status.attached) {
            throw [System.InvalidOperationException]::new('No matching target window was found.')
        }

        $focusAttempted = $false
        $focusResult = $null
        if ($script:Config.target.requireForegroundForInput -and -not $status.isForeground) {
            $focusAttempted = $true
            Write-LogMessage -Message "Test $Action requested while target was in the background; attempting focus." -Details @{ action = $Action; target = $status }
            $focusResult = Focus-TargetWindow
            $status = $focusResult.target
            Write-Message -Type 'target-status' -Payload $status
        }

        if ($script:Config.target.requireForegroundForInput -and -not $status.isForeground) {
            throw [System.InvalidOperationException]::new('Target window is not in the foreground after focus attempt.')
        }

        [ordered]@{
            target = $status
            focusAttempted = $focusAttempted
            focusResult = $focusResult
        }
    }

    $status = $prepared.target
    $details = $null
    switch ($Action) {
        'leftClick' {
            $details = Invoke-LeftClickAction -Reason 'test'
            Write-LogMessage -Message "Test left click attempted via $($details.delivery)." -Details $details
        }
        'rightClick' {
            $details = Invoke-RightClickAction -Reason 'test'
            Write-LogMessage -Message "Test right click attempted via $($details.delivery)." -Details $details
        }
        'f7Press' {
            [Win32Automation]::KeyTap(0x76)
            $details = [ordered]@{ action = 'f7Press'; reason = 'test'; target = $status }
            Write-LogMessage -Message 'Test F7 press attempted.' -Details $details
        }
        'shiftDown' { [Win32Automation]::KeyDown(0x10) }
        'shiftUp' { [Win32Automation]::KeyUp(0x10) }
        'ctrlDown' { [Win32Automation]::KeyDown(0x11) }
        'ctrlUp' { [Win32Automation]::KeyUp(0x11) }
        'releaseModifiers' {
            Release-Modifiers
            $details = [ordered]@{ action = 'releaseModifiers'; reason = 'test' }
            Write-LogMessage -Message 'Test modifier release attempted.' -Details $details
        }
        default { throw [System.ArgumentException]::new("Unknown test action: $Action") }
    }

    return [ordered]@{
        ok = $true
        action = $Action
        target = $status
        focusAttempted = [bool]$prepared.focusAttempted
        focusResult = $prepared.focusResult
        details = $details
    }
}

Release-Modifiers

Write-Message -Type 'hello' -Payload @{
    protocolVersion = 1
    capabilities = @(
        'targetLookup',
        'targetTitleFallback',
        'foregroundCheck',
        'focusTarget',
        'leftClick',
        'rightClick',
        'f7Press',
        'shiftHold',
        'ctrlHold',
        'hotkeyRegistration'
    )
}

Mark-HelperActivity

try {
    $stdinPump = [StdinPump]::new()

    while ($true) {
        $line = $null
        if (-not $stdinPump.TryDequeue([ref]$line)) {
            if ($stdinPump.IsCompleted) {
                if (-not [string]::IsNullOrWhiteSpace($stdinPump.ErrorMessage)) {
                    Write-Message -Type 'log' -Payload @{ message = "Helper stdin pump completed with error: $($stdinPump.ErrorMessage)" }
                }
                break
            }
            if (Test-HelperTimedOut) {
                Write-Message -Type 'log' -Payload @{ message = 'Helper idle timeout reached; shutting down orphaned helper.' }
                break
            }
            Invoke-RuntimeTick
            Start-Sleep -Milliseconds 10
            continue
        }

        if ($null -eq $line) { break }
        if ([string]::IsNullOrWhiteSpace($line)) {
            continue
        }

        try {
            $message = $line | ConvertFrom-Json
            Mark-HelperActivity
            $type = [string]$message.type
            $requestId = if ($null -ne $message.requestId) { [string]$message.requestId } else { $null }

            switch ($type) {
                'heartbeat' {
                    Write-Message -Type 'heartbeat' -Payload @{ receivedAt = (Get-Date).ToString('o') }
                    if ($requestId) { Write-Result -RequestId $requestId -Payload @{ ok = $true } }
                }
                'configure-session' {
                    if ($message.payload.heartbeatIntervalMs) {
                        $script:Config.heartbeatIntervalMs = [int]$message.payload.heartbeatIntervalMs
                    }
                    Write-Result -RequestId $requestId -Payload @{ ok = $true; protocolVersion = 1 }
                }
                'set-target' {
                    $script:Config.target = @{
                        windowTitlePattern = if ($message.payload.windowTitlePattern) { [string]$message.payload.windowTitlePattern } else { 'ClassicConquer' }
                        requireForegroundForInput = if ($null -ne $message.payload.requireForegroundForInput) { [bool]$message.payload.requireForegroundForInput } else { $true }
                    }
                    $status = Get-TargetStatus
                    Write-Message -Type 'target-status' -Payload $status
                    Write-Result -RequestId $requestId -Payload $status
                }
                'focus-target' {
                    $result = Focus-TargetWindow
                    Write-Message -Type 'target-status' -Payload $result.target
                    Write-Result -RequestId $requestId -Payload $result
                }
                'set-runtime-config' {
                    if ($null -ne $message.payload.runtime) {
                        $runtime = $message.payload.runtime
                        $script:Config.runtime.leftClickIntervalMs = if ($runtime.leftClickIntervalMs) { [int]$runtime.leftClickIntervalMs } else { $script:Config.runtime.leftClickIntervalMs }
                        $script:Config.runtime.rightClickIntervalMs = if ($runtime.rightClickIntervalMs) { [int]$runtime.rightClickIntervalMs } else { $script:Config.runtime.rightClickIntervalMs }
                        $script:Config.runtime.f7IntervalMs = if ($runtime.f7IntervalMs) { [int]$runtime.f7IntervalMs } else { $script:Config.runtime.f7IntervalMs }
                        $script:Config.runtime.jitterPercent = if ($null -ne $runtime.jitterPercent) { [int]$runtime.jitterPercent } else { $script:Config.runtime.jitterPercent }
                        $script:Config.runtime.safeStopReleasesModifiers = if ($null -ne $runtime.safeStopReleasesModifiers) { [bool]$runtime.safeStopReleasesModifiers } else { $script:Config.runtime.safeStopReleasesModifiers }
                        $script:Config.runtime.clickMode = if ($runtime.clickMode) { [string]$runtime.clickMode } else { $script:Config.runtime.clickMode }
                    }
                    Reset-RuntimeSchedule
                    Write-Result -RequestId $requestId -Payload @{ ok = $true }
                }
                'register-hotkeys' {
                    $registered = Register-Hotkeys -Hotkeys $message.payload.hotkeys
                    Write-Result -RequestId $requestId -Payload @{ ok = $true; registered = $registered }
                }
                'set-toggle-state' {
                    if ($null -ne $message.payload.runtime) {
                        foreach ($name in @('masterEnabled','leftClickerEnabled','rightClickerEnabled','f7Enabled','shiftHeldEnabled','ctrlHeldEnabled')) {
                            if ($null -ne $message.payload.runtime.$name) {
                                $script:Config.runtime[$name] = [bool]$message.payload.runtime.$name
                            }
                        }
                    }
                    if (-not $script:Config.runtime.masterEnabled -and $script:Config.runtime.safeStopReleasesModifiers) {
                        Release-Modifiers
                    }
                    Reset-RuntimeSchedule
                    $snapshot = Get-RuntimeSnapshot
                    Write-LogMessage -Message 'Runtime toggles applied.' -Details @{ runtime = $snapshot.runtime; target = $snapshot.target }
                    Write-Message -Type 'runtime-applied' -Payload $snapshot
                    Write-Result -RequestId $requestId -Payload $snapshot
                }
                'perform-test-action' {
                    $action = [string]$message.payload.action
                    $result = Invoke-TestAction -Action $action
                    Write-Result -RequestId $requestId -Payload $result
                }
                'perform-emergency-release' {
                    Release-Modifiers
                    Write-Result -RequestId $requestId -Payload @{ ok = $true }
                }
                'emergency-stop' {
                    Release-Modifiers
                    Write-Result -RequestId $requestId -Payload @{ ok = $true }
                }
                'shutdown' {
                    Release-Modifiers
                    Write-Result -RequestId $requestId -Payload @{ ok = $true }
                    break
                }
                default {
                    Write-ErrorMessage -RequestId $requestId -Code 'AUTOMATION_UNKNOWN_MESSAGE' -Message "Unknown helper message type: $type"
                }
            }
        } catch {
            Write-ErrorMessage -RequestId $requestId -Code 'AUTOMATION_HELPER_EXCEPTION' -Message $_.Exception.Message
        }
    }
} finally {
    Release-Modifiers
}