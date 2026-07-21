#!/usr/bin/env bash
set -euo pipefail

repo_dir="${DAILYHOTHOLE_REPO_DIR:-/opt/dailyhothole-public/repo}"
source_url="${DAILYHOTHOLE_SOURCE_URL:-http://127.0.0.1:8766/api/state}"
ssh_key="${DAILYHOTHOLE_SSH_KEY:-/opt/dailyhothole-public/ssh/github-deploy-key}"
known_hosts="${DAILYHOTHOLE_KNOWN_HOSTS:-/opt/dailyhothole-public/ssh/known_hosts}"

if [[ ! -d "${repo_dir}/.git" ]]; then
  echo "repository is missing: ${repo_dir}" >&2
  exit 1
fi
if [[ ! -r "${ssh_key}" || ! -r "${known_hosts}" ]]; then
  echo "GitHub deploy key or known_hosts is missing" >&2
  exit 1
fi

export GIT_SSH_COMMAND="ssh -i ${ssh_key} -o IdentitiesOnly=yes -o StrictHostKeyChecking=yes -o UserKnownHostsFile=${known_hosts}"

git -C "${repo_dir}" pull --rebase --autostash origin main
python3 "${repo_dir}/scripts/generate_snapshot.py" \
  --source "${source_url}" \
  --output "${repo_dir}/public/data/snapshot.json"

git -C "${repo_dir}" add -- public/data/snapshot.json
if git -C "${repo_dir}" diff --cached --quiet; then
  echo "snapshot is unchanged"
  exit 0
fi

git -C "${repo_dir}" \
  -c user.name="DailyHotHole Snapshot Bot" \
  -c user.email="snapshot-bot@users.noreply.github.com" \
  commit -m "chore: update public snapshot"
git -C "${repo_dir}" push origin HEAD:main
