<#
    build_windows.ps1 - one-shot Windows build for PeerDesk.

    Run from the repository root in PowerShell:

        powershell -ExecutionPolicy Bypass -File installer\build_windows.ps1

    Steps:
      1. Create / use a virtual environment
      2. Install runtime + build dependencies
      3. Run the unit test suite (build aborts if tests fail)
      4. Generate an app icon (if missing)
      5. Freeze the app with PyInstaller  -> dist\PeerDesk\
      6. Compile the Inno Setup wizard     -> dist\installer\PeerDesk-<ver>-Setup.exe

    Requires: Python 3.9+ on PATH, and Inno Setup 6 (ISCC.exe) for step 6.
#>

$ErrorActionPreference = "Stop"
$Root = Split-Path -Parent $PSScriptRoot
Set-Location $Root
Write-Host "PeerDesk build root: $Root" -ForegroundColor Cyan

# 1. venv ---------------------------------------------------------------------
if (-not (Test-Path ".\.venv")) {
    Write-Host "Creating virtual environment..." -ForegroundColor Cyan
    python -m venv .venv
}
$py = ".\.venv\Scripts\python.exe"

# 2. dependencies -------------------------------------------------------------
Write-Host "Installing dependencies..." -ForegroundColor Cyan
& $py -m pip install --upgrade pip
& $py -m pip install -r requirements-dev.txt

# 3. tests --------------------------------------------------------------------
Write-Host "Running test suite..." -ForegroundColor Cyan
& $py -m unittest discover -s tests
if ($LASTEXITCODE -ne 0) { throw "Tests failed - aborting build." }

# 4. icon ---------------------------------------------------------------------
$iconPath = Join-Path $PSScriptRoot "assets\peerdesk.ico"
if (-not (Test-Path $iconPath)) {
    Write-Host "Generating placeholder icon..." -ForegroundColor Cyan
    New-Item -ItemType Directory -Force -Path (Split-Path $iconPath) | Out-Null
    & $py (Join-Path $PSScriptRoot "make_icon.py") $iconPath
}

# 5. PyInstaller --------------------------------------------------------------
Write-Host "Freezing application with PyInstaller..." -ForegroundColor Cyan
& $py -m PyInstaller "installer\peerdesk.spec" --noconfirm --clean
if ($LASTEXITCODE -ne 0) { throw "PyInstaller build failed." }

# 6. Inno Setup ---------------------------------------------------------------
$iscc = Get-Command ISCC.exe -ErrorAction SilentlyContinue
if (-not $iscc) {
    $candidate = "${env:ProgramFiles(x86)}\Inno Setup 6\ISCC.exe"
    if (Test-Path $candidate) { $iscc = $candidate } else { $iscc = $null }
}
if ($iscc) {
    Write-Host "Compiling installer with Inno Setup..." -ForegroundColor Cyan
    & $iscc "installer\peerdesk.iss"
    Write-Host "Installer written to dist\installer\" -ForegroundColor Green
} else {
    Write-Warning "ISCC.exe (Inno Setup 6) not found. The frozen app is in dist\PeerDesk\."
    Write-Warning "Install Inno Setup from https://jrsoftware.org/isdl.php, then run:"
    Write-Warning "    ISCC.exe installer\peerdesk.iss"
}

Write-Host "Done." -ForegroundColor Green
