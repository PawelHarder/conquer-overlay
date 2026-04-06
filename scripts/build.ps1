#Requires -Version 5.1
<#
.SYNOPSIS
    Conquer Overlay — Windows build script
.DESCRIPTION
    Installs Node.js dependencies, rebuilds native modules for Electron,
    and produces an NSIS installer in the dist/ directory.
    Must be run from the project root.
    Will self-elevate to Administrator if not already elevated (required by
    electron-builder's code-signing toolkit extraction).
.NOTES
    Requires: Node.js ≥18, npm, Python 3, Visual Studio Build Tools or
              "Desktop development with C++" workload (for native modules).
    Produces: dist\Conquer Overlay Setup *.exe
#>
[CmdletBinding()]
param()

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

# ── Self-elevate if not Administrator ─────────────────────────────────────────
$isAdmin = ([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole(
    [Security.Principal.WindowsBuiltInRole]::Administrator
)
if (-not $isAdmin) {
    Write-Host "[build] Relaunching as Administrator (required for electron-builder)..." -ForegroundColor Yellow
    $ps = (Get-Process -Id $PID).Path
    Start-Process -FilePath $ps `
        -ArgumentList "-NoProfile -ExecutionPolicy Bypass -File `"$PSCommandPath`"" `
        -Verb RunAs `
        -WorkingDirectory $PWD.Path
    exit 0
}

# ── Helpers ───────────────────────────────────────────────────────────────────
function Write-Step  { Write-Host "[build] $args" -ForegroundColor Green }
function Write-Warn  { Write-Host "[build] $args" -ForegroundColor Yellow }
function Write-Fail  { Write-Host "[build] ERROR: $args" -ForegroundColor Red; exit 1 }
function Write-Skip  { Write-Host "[build] SKIP: $args" -ForegroundColor DarkGray }

# ── Working directory ─────────────────────────────────────────────────────────
$ProjectRoot = Split-Path -Parent $PSScriptRoot
Push-Location $ProjectRoot

try {

# ── 1. Tool checks ────────────────────────────────────────────────────────────
Write-Step "Checking required tools..."

if (-not (Get-Command node -ErrorAction SilentlyContinue)) {
    Write-Fail "node not found. Install Node.js ≥18 from https://nodejs.org"
}
if (-not (Get-Command npm -ErrorAction SilentlyContinue)) {
    Write-Fail "npm not found. Install Node.js ≥18 from https://nodejs.org"
}
if (-not (Get-Command python -ErrorAction SilentlyContinue) -and
    -not (Get-Command python3 -ErrorAction SilentlyContinue)) {
    Write-Warn "python not found. node-gyp (native module compilation) may fail."
    Write-Warn "Install Python 3 from https://python.org or via the Node.js installer option."
}

$nodeVer = (node --version) -replace 'v', ''
$major = [int]($nodeVer.Split('.')[0])
if ($major -lt 18) {
    Write-Fail "Node.js ≥18 is required (found v$nodeVer). Upgrade at https://nodejs.org"
}
Write-Step "Node.js v$nodeVer detected."

# Check that the PowerShell helper is present
$HelperScript = Join-Path $ProjectRoot 'native-helper\conquer-helper-spike.ps1'
if (-not (Test-Path $HelperScript)) {
    Write-Fail "Windows automation helper not found: $HelperScript"
}
Write-Step "Windows helper script found."

# ── 2. Check what actually needs to be done ──────────────────────────────────
#
# node_modules is considered up-to-date when the internal .package-lock.json
# marker (written by npm after every install) is at least as new as the
# project's package-lock.json.
#
# Native modules (.node binaries) need a rebuild when they are absent — e.g.
# after a fresh clone, after npm ci deleted them, or after an Electron upgrade.

function Test-NodeModulesUpToDate {
    $marker = Join-Path $ProjectRoot 'node_modules\.package-lock.json'
    if (-not (Test-Path (Join-Path $ProjectRoot 'node_modules'))) { return $false }
    if (-not (Test-Path $marker)) { return $false }
    $lockTime   = (Get-Item (Join-Path $ProjectRoot 'package-lock.json')).LastWriteTimeUtc
    $markerTime = (Get-Item $marker).LastWriteTimeUtc
    return $markerTime -ge $lockTime
}

function Test-NativeModulesBuilt {
    # better-sqlite3 is the canary — if it's missing, postinstall must run.
    $sqlite = Join-Path $ProjectRoot 'node_modules\better-sqlite3\build\Release\better_sqlite3.node'
    return Test-Path $sqlite
}

$needsInstall = -not (Test-NodeModulesUpToDate)
$needsRebuild = -not (Test-NativeModulesBuilt)

# ── 3. Node dependencies ──────────────────────────────────────────────────────
if ($needsInstall) {
    # Kill any running Electron before touching node_modules — the native .node
    # binary is held open while the app is running, causing EPERM on Windows.
    Write-Step "Stopping any running app instances before modifying node_modules..."
    $null = & taskkill /F /IM electron.exe      2>$null
    $null = & taskkill /F /IM conquer-overlay.exe 2>$null
    Start-Sleep -Seconds 2

    # Force-remove the locked binary so npm can overwrite it.
    $lockedFile = Join-Path $ProjectRoot 'node_modules\better-sqlite3\build\Release\better_sqlite3.node'
    if (Test-Path $lockedFile) {
        try {
            Remove-Item -Force $lockedFile -ErrorAction Stop
        } catch {
            Write-Warn "Could not pre-delete better_sqlite3.node - proceeding anyway."
        }
    }

    Write-Step "Installing Node.js dependencies..."
    npm install
    if ($LASTEXITCODE -ne 0) { Write-Fail "npm install failed. Ensure no antivirus is scanning node_modules and retry." }
    $needsRebuild = $true   # fresh install always needs a native rebuild
} else {
    Write-Skip "node_modules is up-to-date — skipping npm install."
}

if ($needsRebuild) {
    Write-Step "Rebuilding native modules for Electron..."
    npm run postinstall
    if ($LASTEXITCODE -ne 0) { Write-Fail "Native module rebuild failed." }
} else {
    Write-Skip "Native modules already built — skipping postinstall."
}

# ── 4. Electron build ─────────────────────────────────────────────────────────
# Clear corrupted winCodeSign cache entries — these contain macOS symlinks that
# 7-Zip could not extract without admin rights in a previous failed run.
$winCodeSignCache = "$env:LOCALAPPDATA\electron-builder\Cache\winCodeSign"
if (Test-Path $winCodeSignCache) {
    Write-Step "Clearing winCodeSign cache (previous non-admin extraction may be corrupt)..."
    Remove-Item -Recurse -Force $winCodeSignCache
}

Write-Step "Building Electron app for Windows (NSIS installer)..."
npm run build:win
if ($LASTEXITCODE -ne 0) { Write-Fail "electron-builder failed." }

# ── 5. Report output ──────────────────────────────────────────────────────────
Write-Step ""
Write-Step "Build complete. Installer in dist\:"
Get-ChildItem -Path (Join-Path $ProjectRoot 'dist') -Filter '*.exe' |
    Select-Object Name, @{N='Size';E={'{0:N0} KB' -f ($_.Length / 1KB)}} |
    Format-Table -AutoSize

} finally {
    Pop-Location
}
