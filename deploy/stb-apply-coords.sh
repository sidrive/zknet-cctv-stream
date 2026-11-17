#!/usr/bin/env bash
# Dijalankan di STB SEKALI setelah update yang menambahkan kolom lat/lng.
# Migrasi aplikasi hanya MENAMBAH kolom kosong; skrip ini yang mengisi nilainya
# dari scripts/camera-coords.json (ikut repo, jadi tidak butuh internet).
#
#   deploy/stb-apply-coords.sh              # lihat rencana (dry-run) lalu isi
#   deploy/stb-apply-coords.sh --force      # timpa juga koordinat yang sudah ada
#
# Aman diulang: koordinat yang sudah terisi TIDAK diubah kecuali pakai --force,
# jadi koreksi manual lewat panel admin tetap utuh.
set -euo pipefail
REPO_DIR="${REPO_DIR:-$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)}"
cd "$REPO_DIR"

[ -f .env ] || { echo ".env belum ada: cp .env.example .env lalu isi (DATA_DIR, ...)" >&2; exit 1; }

# DATA_DIR dibaca dari .env oleh skrip Node; di sini hanya untuk backup.
DATA_DIR="$(grep -E '^DATA_DIR=' .env | tail -1 | cut -d= -f2- | sed -e 's/^"//' -e 's/"$//' -e "s/^'//" -e "s/'$//" | tr -d '\r' || true)"
DATA_DIR="${DATA_DIR:-$REPO_DIR/data}"
DB="$DATA_DIR/cctv.db"

if [ ! -f "$DB" ]; then
  echo "Database tidak ditemukan: $DB" >&2
  echo "Periksa DATA_DIR di .env" >&2
  exit 1
fi

# Cadangkan dulu: koordinat ditulis ke database yang sudah berisi data Anda.
BAK="$DB.pre-coords-$(date +%Y%m%d-%H%M%S).bak"
cp "$DB" "$BAK"
echo "==> Backup: $BAK"

echo "==> Pratinjau (database belum diubah)"
node scripts/fetch-coords.mjs --cache --dry-run

echo
echo "==> Menulis koordinat"
if [ "${1:-}" = "--force" ]; then
  node scripts/fetch-coords.mjs --cache --apply --force
else
  node scripts/fetch-coords.mjs --cache --apply
fi

echo
echo "==> Selesai. Kamera tanpa koordinat tidak digambar di /peta (bukan di 0,0)."
echo "    Isi manual lewat panel admin: Kamera -> Edit -> Latitude/Longitude."
echo "    Bila hasilnya tidak diinginkan, pulihkan backup:"
echo "      cp '$BAK' '$DB' && pm2 restart zknet-cctv"
