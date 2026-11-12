#!/usr/bin/env bash
# Dijalankan di STB: pasang database hasil `npm run db:export` (cctv.db) ke DATA_DIR.
#   deploy/stb-restore-db.sh /path/ke/cctv.db
set -euo pipefail
SRC="${1:?pakai: $0 /path/ke/cctv.db}"
REPO_DIR="${REPO_DIR:-/opt/zknet-cctv-stream}"
cd "$REPO_DIR"
DATA_DIR="$(grep -E '^DATA_DIR=' .env | cut -d= -f2)"; DATA_DIR="${DATA_DIR:-$REPO_DIR/data}"

# Validasi: file harus database SQLite yang utuh dan berisi tabel aplikasi.
node -e '
const D=require("better-sqlite3");
const d=new D(process.argv[1],{readonly:true});
if(d.pragma("integrity_check",{simple:true})!=="ok") throw new Error("integrity_check gagal");
const c=(t)=>d.prepare("select count(*) n from "+t).get().n;
console.log("OK  admin:",c("admins"),"cluster:",c("clusters"),"kamera:",c("cameras"));
' "$SRC"

mkdir -p "$DATA_DIR"
if pm2 describe zknet-cctv >/dev/null 2>&1; then pm2 stop zknet-cctv; fi
[ -f "$DATA_DIR/cctv.db" ] && cp "$DATA_DIR/cctv.db" "$DATA_DIR/cctv.db.bak-$(date +%Y%m%d-%H%M%S)"
rm -f "$DATA_DIR/cctv.db-wal" "$DATA_DIR/cctv.db-shm"   # sisa WAL lama akan merusak DB baru
cp "$SRC" "$DATA_DIR/cctv.db"
chmod 600 "$DATA_DIR/cctv.db"
echo "Database terpasang di $DATA_DIR/cctv.db"
pm2 start zknet-cctv 2>/dev/null || pm2 start ecosystem.config.cjs
