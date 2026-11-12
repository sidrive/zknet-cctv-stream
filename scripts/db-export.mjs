// Salin database ke SATU file utuh yang konsisten (aman walau server sedang jalan / mode WAL).
//   npm run db:export                      -> ./cctv-export.db
//   npm run db:export -- /lokasi/out.db    -> file tujuan sendiri
// Sumber: $DATA_DIR/cctv.db (default ./data/cctv.db).
import Database from 'better-sqlite3'
import fs from 'node:fs'
import path from 'node:path'

const dataDir = path.resolve(process.env.DATA_DIR ?? './data')
const src = path.join(dataDir, 'cctv.db')
const dest = path.resolve(process.argv[2] ?? './cctv-export.db')
if (!fs.existsSync(src)) { console.error(`Database tidak ditemukan: ${src}`); process.exit(1) }
if (fs.existsSync(dest)) { console.error(`Tujuan sudah ada, hapus dulu: ${dest}`); process.exit(1) }

const db = new Database(src, { readonly: true })
await db.backup(dest)
const out = new Database(dest, { readonly: true })
const n = (t) => out.prepare(`select count(*) n from ${t}`).get().n
console.log(`Tersalin ke ${dest}  (admin: ${n('admins')}, cluster: ${n('clusters')}, kamera: ${n('cameras')})`)
