// Impor CCTV Kabupaten Bantul (HLS publik dari restreamer pemkab) ke database zknet-cctv-stream.
// Jalankan: node scripts/import-bantul.mjs [--no-verify] [--proxy] [--dry]
//   --no-verify : lewati cek HTTP ke tiap stream
//   --proxy     : aktifkan proxy server (URL sumber disembunyikan, bandwidth server kena beban)
//   --dry       : hanya tampilkan, tidak menulis DB
import Database from 'better-sqlite3'
import crypto from 'node:crypto'
import path from 'node:path'

const args = new Set(process.argv.slice(2))
const VERIFY = !args.has('--no-verify')
const PROXY = args.has('--proxy')
const DRY = args.has('--dry')

const DB_PATH = path.resolve('data/cctv.db')
const BASE = 'https://stream.bantulkab.go.id/memfs'
const SLUG = 'cctv-bantul'
const CLUSTER_NAME = 'CCTV Kabupaten Bantul'

// uuid -> nama kamera (diambil dari https://bantulkab.go.id/cctv.html)
const CAMERAS = [
  ['a293d997-0258-4317-ac84-0b1bc4abf14c', 'Bendung Klegen'],
  ['803b3df5-f009-4b2a-8984-be6618cf9f54', 'Bendung Merdiko Niten'],
  ['3685768a-94ea-4ac4-aef1-1a91dd1a3c1e', 'Bundaran Srandakan'],
  ['488d8a30-d485-4532-90be-dbd5655f2b24', 'Gerbang Pemda II Manding View Selatan'],
  ['4a6651bb-759c-454a-816a-791beee22af8', 'Gerbang Pemda II Manding View Utara'],
  ['39144c71-b7e0-42f9-8362-a33c669ee3f1', 'Lapangan Paseban Bantul'],
  ['d3b48e44-5438-4d8e-88b1-cbaa094e7a26', 'Makam Kotagede - Bangsal Dudo'],
  ['fabc5c97-17be-4c1b-93a2-fdf5b3bc03e1', 'Makam Kotagede - Halaman Masjid'],
  ['e09992bf-ce95-4fbf-baba-95a79dd722f2', 'Makam Kotagede - Kalurahan Jagalan'],
  ['703d77ac-dbd0-47d9-9cec-ea9700e1287a', 'Makam Kotagede - Sendang'],
  ['20870ab0-03fa-49f3-b499-382acc94a676', 'Makam Pajimatan Imogiri - Masjid'],
  ['d1c5cf69-703a-4db0-8bf1-bed3a6f144b2', 'Makam Pajimatan Imogiri - Tangga Atas'],
  ['96cf71a7-c6d6-4634-acf3-43dbc47ce84e', 'Makam Pajimatan Imogiri - Tangga Tengah'],
  ['e7cc3b8e-74da-44e6-a6c9-783fe6e9cfd5', 'Makam Pajimatan Imogiri - Terminal View Selatan'],
  ['b3ac084f-c75c-45d4-a093-717e997cc478', 'Masjid Agung - Ruang Bermain 01'],
  ['d1bd78e1-0a23-4d08-a47f-84f9e1fae9ca', 'Masjid Agung - Ruang Bermain 02'],
  ['ac18010c-1051-4749-af35-03c3d18e0d5f', 'Masjid Agung - Ruang Bermain 03'],
  ['2acc430a-a201-43a4-bc2c-a98eef05f786', 'Masjid Agung - Ruang Bermain 04'],
  ['6dffc8de-cd16-4caa-a161-1fed712ea8f8', 'Pasar Bantul'],
  ['758afeb5-8281-4053-ba95-5c12d41ef3a1', 'Simpang Gose View Barat Daya'],
  ['0ab0421e-9bcd-4cea-8022-aef0d92e784f', 'Simpang Gose View Tenggara'],
  ['5b08c057-2b07-4b17-a49e-40d1f58cc3b7', 'Simpang Gose View Timur Laut'],
  ['b9a3b5ad-9404-43db-a91a-f369eeef511a', 'Simpang Jejeran View Selatan'],
  ['918ae1a2-4073-450c-9742-202f70cac18a', 'Simpang Jejeran View Utara'],
  ['d595eb28-2232-4eb5-936a-9508dac6a179', 'Simpang Klodran View Barat'],
  ['e53ccfe9-dc51-4e99-8106-d8aeca971f16', 'Simpang Klodran View Selatan'],
  ['38fe6b1c-2563-4c03-bc81-6737c9e4b48c', 'Simpang Klodran View Utara'],
  ['f33a4a0f-2746-408e-88ec-55c83b625b78', 'Simpang Korpri View Barat'],
  ['6f2e19d8-0269-4c9d-a9e6-60ebdb285900', 'Simpang Korpri View Selatan'],
  ['0628dbb6-e7f0-4b07-afae-171693e8520a', 'Simpang Lima Bejen View Barat'],
  ['ddb035fe-5450-4f43-8cca-a7510f333540', 'Simpang Lima Bejen View Timur Selatan'],
  ['d1123bc9-ea65-4d4a-86be-c123ad7b485b', 'Simpang Lima Bejen View Utara'],
  ['f6654a21-2ab2-4a0f-937d-41fcd7ca6d13', 'Simpang Palbapang View Barat'],
  ['b617651b-1e25-410f-bc2b-2ae0a451d4f4', 'Simpang Palbapang View Selatan'],
  ['3bc1bd0b-7861-4a83-b135-d3c23d4b3794', 'Simpang Palbapang View Timur'],
  ['5de5699b-0227-44d8-99a4-bb513f8c2dbc', 'Simpang Palbapang View Utara'],
  ['d2728a49-8a62-4d02-903a-6467727853b5', 'Simpang Paseban View Barat'],
  ['c7bf64d5-9248-4cba-a944-c6ec425674d0', 'Simpang Paseban View Selatan'],
  ['b7497d14-7eb8-4f17-97b5-efe710616c2c', 'Simpang Paseban View Utara'],
  ['0ea9cc1a-743a-4cfe-b7ff-496917206924', 'Stadion Sultan Agung - Pintu Masuk'],
  ['959e2ea1-9f3e-4263-8063-5be53f605429', 'Stadion Sultan Agung - Timur Stadion View Barat'],
  ['26db46a5-6347-4c2e-9c2e-be99e5a4eb09', 'Stadion Sultan Agung - Timur Stadion View Timur'],
]

const urlFor = (uuid) => `${BASE}/${uuid}.m3u8`

async function alive(url) {
  const ac = new AbortController()
  const t = setTimeout(() => ac.abort(), 12000)
  try {
    const r = await fetch(url, { signal: ac.signal, headers: { 'user-agent': 'zknet-cctv-import/1.0' } })
    if (!r.ok) return false
    const txt = await r.text()
    return txt.includes('#EXTM3U')
  } catch {
    return false
  } finally {
    clearTimeout(t)
  }
}

const newId = () => crypto.randomBytes(8).toString('base64url')

console.log(`Database : ${DB_PATH}`)
console.log(`Verifikasi stream: ${VERIFY ? 'ya' : 'tidak'} | proxy: ${PROXY ? 'ON' : 'OFF'} | dry-run: ${DRY ? 'ya' : 'tidak'}`)
console.log('')

// 1. verifikasi
let ok = CAMERAS
if (VERIFY) {
  const results = []
  let done = 0
  const limit = 8
  const queue = [...CAMERAS]
  await Promise.all(
    Array.from({ length: limit }, async () => {
      for (;;) {
        const item = queue.shift()
        if (!item) return
        const [uuid, name] = item
        const live = await alive(urlFor(uuid))
        results.push([uuid, name, live])
        done++
        process.stdout.write(`\r  cek ${done}/${CAMERAS.length}...`)
      }
    }),
  )
  process.stdout.write('\r'.padEnd(40) + '\r')
  ok = results.filter((r) => r[2]).map((r) => [r[0], r[1]])
  const dead = results.filter((r) => !r[2])
  console.log(`  live: ${ok.length} | mati: ${dead.length}`)
  for (const [, name] of dead) console.log(`   - LEWATI (mati): ${name}`)
  console.log('')
}

if (DRY) {
  console.log(`Akan mengimpor ${ok.length} kamera ke cluster "${CLUSTER_NAME}" (slug: ${SLUG}).`)
  for (const [uuid, name] of ok) console.log(`  ${name}  ->  ${urlFor(uuid)}`)
  process.exit(0)
}

// 2. tulis DB
const db = new Database(DB_PATH)
db.pragma('journal_mode = WAL')

const now = new Date().toISOString()
const upsertCluster = db.prepare(
  `INSERT INTO clusters(id,slug,name,description,access_mode,sort)
   VALUES(@id,@slug,@name,@description,'public',@sort)
   ON CONFLICT(slug) DO UPDATE SET name=excluded.name, description=excluded.description`,
)
const findCluster = db.prepare('SELECT id FROM clusters WHERE slug=?')
const existsCam = db.prepare('SELECT id FROM cameras WHERE source_url=?')
const insertCam = db.prepare(
  `INSERT INTO cameras(id,name,description,location,cluster_id,source_type,source_url,proxy,transcode,access_mode,listed,enabled,sort)
   VALUES(@id,@name,@description,@location,@cluster_id,'hls',@source_url,@proxy,0,'public',1,1,@sort)`,
)

db.transaction(() => {
  upsertCluster.run({
    id: findCluster.get(SLUG)?.id ?? newId(),
    slug: SLUG,
    name: CLUSTER_NAME,
    description: 'Kamera CCTV publik Pemerintah Kabupaten Bantul.',
    sort: 0,
  })
  const clusterId = findCluster.get(SLUG).id
  let added = 0
  let skipped = 0
  ok.forEach(([uuid, name], i) => {
    const url = urlFor(uuid)
    if (existsCam.get(url)) {
      skipped++
      return
    }
    insertCam.run({
      id: newId(),
      name,
      description: '',
      location: 'Kabupaten Bantul, DIY',
      cluster_id: clusterId,
      source_url: url,
      proxy: PROXY ? 1 : 0,
      sort: i,
    })
    added++
  })
  console.log(`Selesai. cluster id=${clusterId} | ditambah=${added} | dilewati(sudah ada)=${skipped}`)
})()

const total = db.prepare('SELECT COUNT(*) c FROM cameras').get().c
console.log(`Total kamera di database sekarang: ${total}`)
db.close()
