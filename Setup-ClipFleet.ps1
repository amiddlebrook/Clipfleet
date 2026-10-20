param([string]$Repository = "amiddlebrook/ClipFleet")
$ErrorActionPreference='Stop'
function Need($command) {if (-not (Get-Command $command -ErrorAction SilentlyContinue)) {throw "Missing $command. Install and log in before running setup."}}
Need git
Need gh
Write-Host "Creating independent ClipFleet repository $Repository (does not modify RivetFlow)." -ForegroundColor Cyan
& gh auth status
if ($LASTEXITCODE -ne 0) {throw 'Authenticate with gh auth login first.'}
if (-not (Test-Path '.git')) {
  & git init -b main
  if ($LASTEXITCODE -ne 0) {throw 'git init failed'}
  & git add .
  & git commit -m 'feat: initialize ClipFleet automation pipeline'
  if ($LASTEXITCODE -ne 0) {throw 'Commit failed. Configure git identity (user.name and user.email).'}
}
& gh repo create $Repository --public --source . --remote origin --push
if ($LASTEXITCODE -ne 0) {throw 'GitHub repository creation or push failed; check whether this name already exists.'}
Write-Host 'Repo ready. Set secrets CLOUDFLARE_ACCOUNT_ID, CLOUDFLARE_API_TOKEN and CLIPFLEET_ADMIN_TOKEN in this repository.' -ForegroundColor Green
Write-Host 'Then run the Deploy Cloudflare Worker GitHub Action, and set CLIPFLEET_WORKER_URL to your Worker URL.'
