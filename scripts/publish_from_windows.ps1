param(
    [string]$SshKey = "F:\PKUhole\.automation\clab_snapshot.pem",
    [string]$GitHubDeployKey = "F:\PKUhole\.automation\github_deploy_key",
    [string]$GitHubPushUrl = "git@github.com:Rainier-Gu/DailyHotHole.git",
    [string]$ClabHost = "10.129.243.229",
    [string]$ClabUser = "rocky"
)

$ErrorActionPreference = "Stop"
Set-StrictMode -Version Latest

$repoRoot = Split-Path -Parent $PSScriptRoot
$gitSafeDirectory = $repoRoot.Replace("\", "/")
$githubDeployKeyForSsh = $GitHubDeployKey.Replace("\", "/")
$githubKnownHosts = Join-Path (Split-Path -Parent $GitHubDeployKey) "github_known_hosts"
$githubKnownHostsForSsh = $githubKnownHosts.Replace("\", "/")
$gitSshCommand = "ssh -i `"$githubDeployKeyForSsh`" -o IdentitiesOnly=yes -o BatchMode=yes -o StrictHostKeyChecking=accept-new -o UserKnownHostsFile=`"$githubKnownHostsForSsh`" -o ConnectTimeout=20 -o ServerAliveInterval=10 -o ServerAliveCountMax=2"
$gitCommonArgs = @(
    "-c", "safe.directory=$gitSafeDirectory",
    "-c", "http.sslBackend=openssl",
    "-C", $repoRoot
)
$gitPushArgs = @(
    "-c", "safe.directory=$gitSafeDirectory",
    "-c", "core.sshCommand=$gitSshCommand",
    "-C", $repoRoot
)
$downloadDir = Join-Path $repoRoot ".deploy"
$downloadPath = Join-Path $downloadDir "snapshot.download.json"
$snapshotPath = Join-Path $repoRoot "public\data\snapshot.json"
$remotePath = "/opt/dailyhothole-public/export/snapshot.json"

if (-not (Test-Path -LiteralPath $SshKey -PathType Leaf)) {
    throw "SSH key not found: $SshKey"
}
if (-not (Test-Path -LiteralPath $GitHubDeployKey -PathType Leaf)) {
    throw "GitHub deploy key not found: $GitHubDeployKey"
}

New-Item -ItemType Directory -Force -Path $downloadDir | Out-Null
$env:GIT_TERMINAL_PROMPT = "0"

& git @gitCommonArgs remote set-url --push origin $GitHubPushUrl
if ($LASTEXITCODE -ne 0) { throw "git push URL configuration failed with exit code $LASTEXITCODE" }

& git @gitCommonArgs pull --rebase --autostash origin main
if ($LASTEXITCODE -ne 0) { throw "git pull failed with exit code $LASTEXITCODE" }

$remote = "${ClabUser}@${ClabHost}:${remotePath}"
& scp -i $SshKey -o BatchMode=yes -o StrictHostKeyChecking=accept-new -o ConnectTimeout=20 -o ServerAliveInterval=10 -o ServerAliveCountMax=2 $remote $downloadPath
if ($LASTEXITCODE -ne 0) { throw "snapshot download failed with exit code $LASTEXITCODE" }

& python (Join-Path $PSScriptRoot "validate_public_snapshot.py") $downloadPath
if ($LASTEXITCODE -ne 0) { throw "snapshot validation failed with exit code $LASTEXITCODE" }

Move-Item -LiteralPath $downloadPath -Destination $snapshotPath -Force
& git @gitCommonArgs add -- public/data/snapshot.json
if ($LASTEXITCODE -ne 0) { throw "git add failed with exit code $LASTEXITCODE" }

& git @gitCommonArgs diff --cached --quiet
$snapshotChanged = $false
if ($LASTEXITCODE -eq 0) {
    Write-Output "Public snapshot is unchanged; checking for pending commits."
}
elseif ($LASTEXITCODE -eq 1) {
    & git @gitCommonArgs commit -m "chore: update public snapshot"
    if ($LASTEXITCODE -ne 0) { throw "git commit failed with exit code $LASTEXITCODE" }
    $snapshotChanged = $true
}
else {
    throw "git diff failed with exit code $LASTEXITCODE"
}

& git @gitPushArgs push origin HEAD:main
if ($LASTEXITCODE -ne 0) { throw "git push failed with exit code $LASTEXITCODE" }

if ($snapshotChanged) {
    Write-Output "DailyHotHole public snapshot published successfully."
}
else {
    Write-Output "Public snapshot is unchanged; pending commits are synchronized."
}
