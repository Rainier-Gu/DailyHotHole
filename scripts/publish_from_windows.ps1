param(
    [string]$SshKey = "F:\PKUhole\pc1.pem",
    [string]$ClabHost = "10.129.243.229",
    [string]$ClabUser = "rocky"
)

$ErrorActionPreference = "Stop"
Set-StrictMode -Version Latest

$repoRoot = Split-Path -Parent $PSScriptRoot
$downloadDir = Join-Path $repoRoot ".deploy"
$downloadPath = Join-Path $downloadDir "snapshot.download.json"
$snapshotPath = Join-Path $repoRoot "public\data\snapshot.json"
$remotePath = "/opt/dailyhothole-public/export/snapshot.json"

if (-not (Test-Path -LiteralPath $SshKey -PathType Leaf)) {
    throw "SSH key not found: $SshKey"
}

New-Item -ItemType Directory -Force -Path $downloadDir | Out-Null

& git -C $repoRoot pull --rebase --autostash origin main
if ($LASTEXITCODE -ne 0) { throw "git pull failed with exit code $LASTEXITCODE" }

$remote = "${ClabUser}@${ClabHost}:${remotePath}"
& scp -i $SshKey -o BatchMode=yes -o StrictHostKeyChecking=accept-new $remote $downloadPath
if ($LASTEXITCODE -ne 0) { throw "snapshot download failed with exit code $LASTEXITCODE" }

& python (Join-Path $PSScriptRoot "validate_public_snapshot.py") $downloadPath
if ($LASTEXITCODE -ne 0) { throw "snapshot validation failed with exit code $LASTEXITCODE" }

Move-Item -LiteralPath $downloadPath -Destination $snapshotPath -Force
& git -C $repoRoot add -- public/data/snapshot.json
if ($LASTEXITCODE -ne 0) { throw "git add failed with exit code $LASTEXITCODE" }

& git -C $repoRoot diff --cached --quiet
if ($LASTEXITCODE -eq 0) {
    Write-Output "Public snapshot is unchanged; nothing to publish."
    exit 0
}
if ($LASTEXITCODE -ne 1) { throw "git diff failed with exit code $LASTEXITCODE" }

& git -C $repoRoot commit -m "chore: update public snapshot"
if ($LASTEXITCODE -ne 0) { throw "git commit failed with exit code $LASTEXITCODE" }
& git -C $repoRoot push origin main
if ($LASTEXITCODE -ne 0) { throw "git push failed with exit code $LASTEXITCODE" }

Write-Output "DailyHotHole public snapshot published successfully."
