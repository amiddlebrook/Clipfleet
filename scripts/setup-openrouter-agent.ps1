# ClipFleet local OpenRouter setup (Windows PowerShell)
# Requires Python 3.12 launcher, no paid service or mandatory cloud key.
$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest
$root = Split-Path -Parent $PSScriptRoot
Push-Location $root
try {
    Write-Host "ClipFleet — free browser agent + OpenRouter"
    $py = Get-Command py -ErrorAction SilentlyContinue
    if (-not $py) {
        throw "Install Python 3.12 from https://www.python.org/downloads/ and ensure the Windows py launcher is enabled."
    }
    & py -3.12 --version | Out-Host
    if ($LASTEXITCODE -ne 0) {
        throw "Python 3.12 is required. Install it first from https://www.python.org/downloads/ ."
    }
    if (-not (Test-Path '.venv\Scripts\python.exe')) {
        & py -3.12 -m venv .venv
        if ($LASTEXITCODE -ne 0) { throw 'Creating Python virtual environment failed.' }
    }
    & .\.venv\Scripts\python.exe -m pip install --disable-pip-version-check --upgrade pip
    if ($LASTEXITCODE -ne 0) { throw 'Updating pip failed.' }
    & .\.venv\Scripts\python.exe -m pip install --disable-pip-version-check browser-use python-dotenv
    if ($LASTEXITCODE -ne 0) { throw 'Installing local Browser Use dependencies failed.' }
    & .\.venv\Scripts\browser-use.exe install
    if ($LASTEXITCODE -ne 0) { throw 'Installing Chromium failed.' }

    if (-not (Test-Path .env)) {
        @"
# Local ClipFleet AI key — never commit this file or paste it into the public dashboard.
OPENROUTER_API_KEY=
OPENROUTER_MODEL=openrouter/free
"@ | Set-Content -Encoding utf8 .env
        Write-Host "Created .env. Paste your OpenRouter key into OPENROUTER_API_KEY locally."
    }
    Write-Host ''
    Write-Host 'Ready. Add your key to .env then test:'
    Write-Host '.\.venv\Scripts\python.exe scripts\local_openrouter_agent.py --mode check-key'
    Write-Host ''
    Write-Host 'Review one campaign:'
    Write-Host '.\.venv\Scripts\python.exe scripts\local_openrouter_agent.py --mode review-campaign --campaign-url https://contentrewards.com/c/campaigns/PASTE-CAMPAIGN-ID'
    Write-Host ''
    Write-Host 'AI review uses only zero-priced OpenRouter models. Public posting remains a manual authorized step.'
} finally {
    Pop-Location
}
