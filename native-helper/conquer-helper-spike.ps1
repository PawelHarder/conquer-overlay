$ErrorActionPreference = 'Stop'

Add-Type -TypeDefinition @"
using System;
using System.Runtime.InteropServices;
using System.Text;

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
    private static extern bool GetWindowRect(IntPtr hWnd, out RECT lpRect);

    [DllImport("user32.dll")]
    private static extern short GetAsyncKeyState(int vKey);

    [DllImport("user32.dll", SetLastError = true)]
    private static extern UInt32 SendInput(UInt32 nInputs, INPUT[] pInputs, int cbSize);

    private const UInt32 INPUT_MOUSE = 0;
    private const UInt32 INPUT_KEYBOARD = 1;
    private const UInt32 MOUSEEVENTF_LEFTDOWN = 0x0002;
    private const UInt32 MOUSEEVENTF_LEFTUP = 0x0004;
    private const UInt32 MOUSEEVENTF_RIGHTDOWN = 0x0008;
    private const UInt32 MOUSEEVENTF_RIGHTUP = 0x0010;
    private const UInt32 KEYEVENTF_KEYUP = 0x0002;

    [StructLayout(LayoutKind.Sequential)]
    public struct RECT {
        public Int32 Left;
        public Int32 Top;
        public Int32 Right;
        public Int32 Bottom;
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

    public static void LeftClick() {
        SendMouse(MOUSEEVENTF_LEFTDOWN, MOUSEEVENTF_LEFTUP);
    }

    public static void RightClick() {
        SendMouse(MOUSEEVENTF_RIGHTDOWN, MOUSEEVENTF_RIGHTUP);
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
        INPUT[] inputs = new INPUT[] {
            new INPUT {
                type = INPUT_MOUSE,
                U = new InputUnion { mi = new MOUSEINPUT { dx = 0, dy = 0, mouseData = 0, dwFlags = downFlag, time = 0, dwExtraInfo = IntPtr.Zero } }
            },
            new INPUT {
                type = INPUT_MOUSE,
                U = new InputUnion { mi = new MOUSEINPUT { dx = 0, dy = 0, mouseData = 0, dwFlags = upFlag, time = 0, dwExtraInfo = IntPtr.Zero } }
            }
        };
        SendInput((UInt32)inputs.Length, inputs, Marshal.SizeOf(typeof(INPUT)));
    }
}
"@

$script:Config = @{
    heartbeatIntervalMs = 10000
    target = @{
        windowTitlePattern = 'Shinsei - ClassicConquer'
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
    }
    runtimeApplied = @{
        shiftDown = $false
        ctrlDown = $false
        lastLeftAt = 0L
        lastRightAt = 0L
        lastF7At = 0L
        nextLeftOffset = 0
        nextRightOffset = 0
        nextF7Offset = 0
        lastTargetEmitAt = 0L
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
    [Console]::Out.WriteLine(($message | ConvertTo-Json -Compress -Depth 10))
    [Console]::Out.Flush()
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

function Get-TargetStatus {
    $pattern = [string]$script:Config.target.windowTitlePattern
    $handle = [Win32Automation]::FindWindowByTitleContains($pattern)
    $attached = $handle -ne [IntPtr]::Zero
    $title = if ($attached) { [Win32Automation]::GetWindowTitle($handle) } else { '' }
    $isForeground = if ($attached) { [Win32Automation]::IsForeground($handle) } else { $false }
    $rect = if ($attached) { [Win32Automation]::GetRect($handle) } else { $null }

    return [ordered]@{
        attached = $attached
        isForeground = $isForeground
        title = $title
        windowTitlePattern = $pattern
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

function Release-Modifiers {
    [Win32Automation]::KeyUp(0x10)
    [Win32Automation]::KeyUp(0x11)
    $script:Config.runtimeApplied.shiftDown = $false
    $script:Config.runtimeApplied.ctrlDown = $false
}

function Get-TickMs {
    return [Environment]::TickCount64
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
        'MouseMiddle' { return 0x04 }
        'Escape' { return 0x1B }
        'F1' { return 0x70 }
        'F2' { return 0x71 }
        'F3' { return 0x72 }
        'F7' { return 0x76 }
        'Semicolon' { return 0xBA }
        'Quote' { return 0xDE }
        'Comma' { return 0xBC }
        'BracketLeft' { return 0xDB }
        'BracketRight' { return 0xDD }
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
    if (-not $runtime.masterEnabled) {
        if ($runtime.safeStopReleasesModifiers) {
            Release-Modifiers
        } else {
            Apply-ModifierState
        }
        return
    }

    $targetStatus = Get-TargetStatus
    if ((Get-TickMs) - $script:Config.runtimeApplied.lastTargetEmitAt -ge 750) {
        $script:Config.runtimeApplied.lastTargetEmitAt = Get-TickMs
        Write-Message -Type 'target-status' -Payload $targetStatus
    }

    Poll-Hotkeys -TargetStatus $targetStatus

    if (-not $targetStatus.attached) {
        if ($runtime.safeStopReleasesModifiers) { Release-Modifiers }
        return
    }

    if ($script:Config.target.requireForegroundForInput -and -not $targetStatus.isForeground) {
        if ($runtime.safeStopReleasesModifiers) { Release-Modifiers }
        return
    }

    Apply-ModifierState

    $now = Get-TickMs
    if ($runtime.leftClickerEnabled) {
        $leftInterval = [Math]::Max(1, [int]$runtime.leftClickIntervalMs + [int]$script:Config.runtimeApplied.nextLeftOffset)
        if ($now - $script:Config.runtimeApplied.lastLeftAt -ge $leftInterval) {
            [Win32Automation]::LeftClick()
            $script:Config.runtimeApplied.lastLeftAt = $now
            $script:Config.runtimeApplied.nextLeftOffset = Get-JitterOffset -BaseIntervalMs ([int]$runtime.leftClickIntervalMs)
        }
    }

    if ($runtime.rightClickerEnabled) {
        $rightInterval = [Math]::Max(1, [int]$runtime.rightClickIntervalMs + [int]$script:Config.runtimeApplied.nextRightOffset)
        if ($now - $script:Config.runtimeApplied.lastRightAt -ge $rightInterval) {
            [Win32Automation]::RightClick()
            $script:Config.runtimeApplied.lastRightAt = $now
            $script:Config.runtimeApplied.nextRightOffset = Get-JitterOffset -BaseIntervalMs ([int]$runtime.rightClickIntervalMs)
        }
    }

    if ($runtime.f7Enabled) {
        $f7Interval = [Math]::Max(1, [int]$runtime.f7IntervalMs + [int]$script:Config.runtimeApplied.nextF7Offset)
        if ($now - $script:Config.runtimeApplied.lastF7At -ge $f7Interval) {
            [Win32Automation]::KeyTap(0x76)
            $script:Config.runtimeApplied.lastF7At = $now
            $script:Config.runtimeApplied.nextF7Offset = Get-JitterOffset -BaseIntervalMs ([int]$runtime.f7IntervalMs)
        }
    }
}

function Invoke-TestAction {
    param([string]$Action)

    $status = Assert-InputAllowed
    switch ($Action) {
        'leftClick' { [Win32Automation]::LeftClick() }
        'rightClick' { [Win32Automation]::RightClick() }
        'f7Press' { [Win32Automation]::KeyTap(0x76) }
        'shiftDown' { [Win32Automation]::KeyDown(0x10) }
        'shiftUp' { [Win32Automation]::KeyUp(0x10) }
        'ctrlDown' { [Win32Automation]::KeyDown(0x11) }
        'ctrlUp' { [Win32Automation]::KeyUp(0x11) }
        'releaseModifiers' { Release-Modifiers }
        default { throw [System.ArgumentException]::new("Unknown test action: $Action") }
    }

    return [ordered]@{
        ok = $true
        action = $Action
        target = $status
    }
}

Write-Message -Type 'hello' -Payload @{
    protocolVersion = 1
    capabilities = @(
        'targetLookup',
        'foregroundCheck',
        'leftClick',
        'rightClick',
        'f7Press',
        'shiftHold',
        'ctrlHold',
        'hotkeyRegistration'
    )
}

try {
    while ($true) {
        if ([Console]::In.Peek() -lt 0) {
            Invoke-RuntimeTick
            Start-Sleep -Milliseconds 10
            continue
        }

        $line = [Console]::In.ReadLine()
        if ($null -eq $line) { break }
        if ([string]::IsNullOrWhiteSpace($line)) {
            continue
        }

        try {
            $message = $line | ConvertFrom-Json
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
                        windowTitlePattern = if ($message.payload.windowTitlePattern) { [string]$message.payload.windowTitlePattern } else { 'Shinsei - ClassicConquer' }
                        requireForegroundForInput = if ($null -ne $message.payload.requireForegroundForInput) { [bool]$message.payload.requireForegroundForInput } else { $true }
                    }
                    $status = Get-TargetStatus
                    Write-Message -Type 'target-status' -Payload $status
                    Write-Result -RequestId $requestId -Payload $status
                }
                'set-runtime-config' {
                    if ($null -ne $message.payload.runtime) {
                        $runtime = $message.payload.runtime
                        $script:Config.runtime.leftClickIntervalMs = if ($runtime.leftClickIntervalMs) { [int]$runtime.leftClickIntervalMs } else { $script:Config.runtime.leftClickIntervalMs }
                        $script:Config.runtime.rightClickIntervalMs = if ($runtime.rightClickIntervalMs) { [int]$runtime.rightClickIntervalMs } else { $script:Config.runtime.rightClickIntervalMs }
                        $script:Config.runtime.f7IntervalMs = if ($runtime.f7IntervalMs) { [int]$runtime.f7IntervalMs } else { $script:Config.runtime.f7IntervalMs }
                        $script:Config.runtime.jitterPercent = if ($null -ne $runtime.jitterPercent) { [int]$runtime.jitterPercent } else { $script:Config.runtime.jitterPercent }
                        $script:Config.runtime.safeStopReleasesModifiers = if ($null -ne $runtime.safeStopReleasesModifiers) { [bool]$runtime.safeStopReleasesModifiers } else { $script:Config.runtime.safeStopReleasesModifiers }
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