#!/usr/bin/env bash
# Dijalankan di LAPTOP/sandbox (bukan di STB): build -> commit dist -> push.
# STB lambat, jadi build tidak dilakukan di sana (pola sama omni-invest-dashboard / kpps-pilkalurah).
set -euo pipefail
cd "$(dirname "$0")/.."

BRANCH="$(git rev-parse --abbrev-ref HEAD)"
echo "==> Rilis dari branch: $BRANCH"

if [ -n "$(git status --porcelain -- . ':!server/dist' ':!web/dist')" ]; then
  echo "Ada perubahan source yang belum di-commit. Commit dulu, baru rilis." >&2
  exit 1
fi

npm ci
npm test            # unit + e2e API (RTSP dilewati bila MEDIAMTX_BIN tidak di-set)
npm run build

git add -f server/dist web/dist
if git diff --cached --quiet; then
  echo "dist tidak berubah, tidak ada yang di-commit."
else
  git commit -m "build: dist untuk deploy STB"
fi
git push origin "$BRANCH"
echo "==> Selesai. Di STB jalankan: /opt/zknet-cctv-stream/deploy/stb-update.sh"
