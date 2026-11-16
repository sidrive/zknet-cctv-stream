// Ambil KOORDINAT kamera dari situs sumber, lalu simpan ke scripts/camera-coords.json.
//
// Jalankan:
//   node scripts/fetch-coords.mjs            # ambil dari internet
//   node scripts/fetch-coords.mjs --apply    # ambil + tulis lat/lng ke database
//   node scripts/fetch-coords.mjs --cache    # pakai scripts/camera-coords.json yang ada, lalu --apply
//   node scripts/fetch-coords.mjs --apply --force  # timpa juga koordinat yang sudah terisi
//
// AMAN DIULANG: tanpa --force, koordinat yang SUDAH ADA di database tidak diubah.
// Jadi koreksi manual lewat panel admin (atau hasil --apply sebelumnya) tidak hilang.
//
// Sumber:
//   Bantul  https://bantulkab.go.id/cctv/peta.html   (var long/lat/tempat)
//   Jogja   https://cctv.jogjakota.go.id/home/getdata (cctv_latitude/cctv_longitude)
//
// PENTING soal Bantul: situsnya memberi UUID stream yang BERGESER satu posisi
// dibanding halaman daftar /cctv.html (mis. "Bendung Klegen" diberi UUID milik
// "Bendung Merdiko Niten"). Karena itu koordinat Bantul dicocokkan lewat NAMA,
// bukan UUID. Dengan UUID, 38 dari 41 kamera akan menempel ke lokasi kamera lain.
import fs from 'node:fs'
import path from 'node:path'
import Database from 'better-sqlite3'

const args = new Set(process.argv.slice(2))
const APPLY = args.has('--apply')
const FROM_CACHE = args.has('--cache')
// Tanpa --force, kamera yang sudah punya lat/lng dibiarkan apa adanya.
const FORCE = args.has('--force')
// Sengaja di luar data/ karena folder itu di-.gitignore; cache ini ikut repo agar
// hasilnya bisa dipakai tanpa internet (mis. saat deploy ke STB).
const OUT = path.resolve('scripts/camera-coords.json')
const DB_PATH = path.resolve(process.env.DATA_DIR ?? 'data', 'cctv.db')

const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130 Safari/537.36'
const normName = (s) => String(s ?? '').replace(/\s+/g, ' ').trim().toLowerCase()
const normUrl = (u) => String(u ?? '').replace(/%20/gi, ' ').replace(/\s+/g, ' ').trim().toLowerCase().replace(/\/+$/, '')

async function get(url, headers = {}) {
  const res = await fetch(url, { headers: { 'user-agent': UA, ...headers }, signal: AbortSignal.timeout(30_000) })
  if (!res.ok) throw new Error(`${res.status} ${url}`)
  return res
}

// ---------------- Bantul: parse blok marker dari halaman peta ----------------
async function fetchBantul() {
  const html = await (await get('https://bantulkab.go.id/cctv/peta.html')).text()
  const re = /var\s+long\s*=\s*([-\d.]+);?\s*var\s+lat\s*=\s*([-\d.]+);?\s*var\s+tempat\s*=\s*'([^']*)'/g
  const out = []
  for (const m of html.matchAll(re)) {
    const lng = Number(m[1]), lat = Number(m[2]), name = m[3].trim()
    if (Number.isFinite(lat) && Number.isFinite(lng) && name) out.push({ name, lat, lng })
  }
  return out
}

// ---------------- Jogja: endpoint JSON home/getdata ----------------
async function fetchJogja() {
  // Tanpa X-Requested-With/Referer endpoint ini membalas "No direct script access allowed".
  const res = await get('https://cctv.jogjakota.go.id/home/getdata', {
    'x-requested-with': 'XMLHttpRequest',
    referer: 'https://cctv.jogjakota.go.id/',
    accept: 'application/json, text/javascript, */*; q=0.01',
  })
  const rows = await res.json()
  return rows
    .map((x) => ({
      name: String(x.cctv_title ?? '').trim(),
      lat: Number(x.cctv_latitude),
      lng: Number(x.cctv_longitude),
      url: x.cctv_link,
    }))
    .filter((x) => x.name && Number.isFinite(x.lat) && Number.isFinite(x.lng) && x.lat !== 0 && x.lng !== 0)
}

// Bantul tidak membawa URL stream yang bisa dipercaya (UUID bergeser), jadi simpan nama saja.
async function build() {
  const out = {}
  const bantul = await fetchBantul()
  out.bantul = { byName: {}, fetchedAt: new Date().toISOString(), count: bantul.length }
  for (const x of bantul) out.bantul.byName[normName(x.name)] = { name: x.name, lat: x.lat, lng: x.lng }

  const jogja = await fetchJogja()
  out.jogja = { byUrl: {}, byName: {}, fetchedAt: new Date().toISOString(), count: jogja.length }
  for (const x of jogja) {
    const rec = { name: x.name, lat: x.lat, lng: x.lng }
    if (x.url) out.jogja.byUrl[normUrl(x.url)] = rec
    out.jogja.byName[normName(x.name)] = rec
  }

  fs.mkdirSync(path.dirname(OUT), { recursive: true })
  fs.writeFileSync(OUT, JSON.stringify(out, null, 1) + '\n')
  console.log(`Bantul: ${bantul.length} koordinat, Jogja: ${jogja.length} koordinat -> ${path.relative(process.cwd(), OUT)}`)
}

function applyToDb(coords) {
  if (!fs.existsSync(DB_PATH)) {
    console.error(`Database tidak ditemukan: ${DB_PATH}`)
    process.exit(1)
  }
  const db = new Database(DB_PATH)
  // Kolom ditambahkan hanya jika belum ada (aman dijalankan berulang).
  const cols = db.prepare('PRAGMA table_info(cameras)').all().map((c) => c.name)
  if (!cols.includes('lat')) db.exec('ALTER TABLE cameras ADD COLUMN lat REAL')
  if (!cols.includes('lng')) db.exec('ALTER TABLE cameras ADD COLUMN lng REAL')

  const rows = db
    .prepare(`SELECT c.id, c.name, c.source_url, c.lat, c.lng, cl.slug AS cluster
              FROM cameras c LEFT JOIN clusters cl ON cl.id = c.cluster_id`)
    .all()
  const upd = db.prepare('UPDATE cameras SET lat = ?, lng = ? WHERE id = ?')
  let hit = 0
  let kept = 0
  const miss = []
  db.transaction(() => {
    for (const r of rows) {
      let rec
      if (r.cluster === 'cctv-jogja') rec = coords.jogja.byUrl[normUrl(r.source_url)] ?? coords.jogja.byName[normName(r.name)]
      else if (r.cluster === 'cctv-bantul') rec = coords.bantul.byName[normName(r.name)]
      else rec = coords.jogja.byUrl[normUrl(r.source_url)] ?? coords.bantul.byName[normName(r.name)] ?? coords.jogja.byName[normName(r.name)]
      if (!rec) { miss.push(r.name); continue }
      // Jangan timpa koordinat yang sudah ada kecuali diminta lewat --force.
      if (!FORCE && r.lat != null && r.lng != null) { kept++; continue }
      upd.run(rec.lat, rec.lng, r.id); hit++
    }
  })()
  db.close()
  console.log(`Koordinat diterapkan ke ${hit}/${rows.length} kamera.`)
  if (kept) console.log(`Dibiarkan (sudah punya koordinat): ${kept}. Pakai --force untuk menimpa.`)
  if (miss.length) {
    console.log(`Tanpa koordinat di sumber (${miss.length}):`)
    for (const n of miss) console.log(`  - ${n}`)
  }
}

if (FROM_CACHE) {
  if (!fs.existsSync(OUT)) { console.error(`Belum ada cache: ${OUT}`); process.exit(1) }
  const coords = JSON.parse(fs.readFileSync(OUT, 'utf8'))
  console.log(`Cache: Bantul ${Object.keys(coords.bantul.byName).length}, Jogja ${Object.keys(coords.jogja.byUrl).length}`)
  if (APPLY) applyToDb(coords)
  else console.log('Tambahkan --apply untuk menulis ke database.')
} else {
  const coords = await (async () => {
    await build()
    return JSON.parse(fs.readFileSync(OUT, 'utf8'))
  })()
  if (APPLY) applyToDb(coords)
  else console.log('Tambahkan --apply untuk menulis lat/lng ke database.')
}
