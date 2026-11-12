#!/usr/bin/env bash
# Dijalankan di STB. Aman dipakai untuk setup pertama MAUPUN update berikutnya.
#   REPO_DIR (default /opt/zknet-cctv-stream), BRANCH (default: branch yang sedang aktif)
set -euo pipefail
REPO_DIR="${REPO_DIR:-/opt/zknet-cctv-stream}"
cd "$REPO_DIR"

NODE_MAJOR="$(node -p 'process.versions.node.split(".")[0]')"
NODE_MINOR="$(node -p 'process.versions.node.split(".")[1]')"
if [ "$NODE_MAJOR" -lt 20 ] || { [ "$NODE_MAJOR" -eq 20 ] && [ "$NODE_MINOR" -lt 6 ]; }; then
  echo "Node >= 20.6 dibutuhkan (terpasang: $(node -v))" >&2; exit 1
fi
command -v ffmpeg >/dev/null || { echo "ffmpeg belum terpasang: apt install -y ffmpeg" >&2; exit 1; }
command -v pm2 >/dev/null || { echo "pm2 belum terpasang: npm i -g pm2" >&2; exit 1; }
[ -f .env ] || { echo ".env belum ada: cp .env.example .env lalu isi (PORT, DATA_DIR, SETUP_TOKEN, ...)" >&2; exit 1; }

BRANCH="${BRANCH:-$(git rev-parse --abbrev-ref HEAD)}"
git fetch origin "$BRANCH"
git checkout "$BRANCH"
git pull --ff-only origin "$BRANCH"

# Hanya dependency server (web sudah ter-build di web/dist). better-sqlite3 memakai binary arm64 siap-pakai.
npm ci --omit=dev -w server

if pm2 describe zknet-cctv >/dev/null 2>&1; then
  pm2 restart zknet-cctv --update-env
else
  pm2 start ecosystem.config.cjs
fi
pm2 save

PORT="$(grep -E '^PORT=' .env | cut -d= -f2 || true)"; PORT="${PORT:-8080}"
sleep 2
curl -fsS "http://127.0.0.1:${PORT}/api/health" && echo "  <- health OK (port ${PORT})"
