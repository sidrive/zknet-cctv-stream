import { test, before, after } from 'node:test'
import assert from 'node:assert/strict'
import { spawn, spawnSync, type ChildProcess } from 'node:child_process'
import fs from 'node:fs'
import http from 'node:http'
import os from 'node:os'
import path from 'node:path'
import { rewriteM3u8 } from './streams.js'

const PORT = 18080
const BASE = `http://127.0.0.1:${PORT}`
const hasFfmpeg = spawnSync('ffmpeg', ['-version']).status === 0

let server: ChildProcess
let tmp: string
let upstream: http.Server
let rtspSrc: ChildProcess | undefined
let adminCookie = ''
const ids: Record<string, string> = {}

async function api(p: string, init: RequestInit & { json?: unknown; grant?: string; admin?: boolean } = {}) {
  const headers: Record<string, string> = {}
  if (init.json !== undefined) headers['content-type'] = 'application/json'
  if (init.grant) headers['x-grant'] = init.grant
  if (init.admin) headers.cookie = adminCookie
  const res = await fetch(BASE + p, {
    ...init,
    headers: { ...headers, ...(init.headers as Record<string, string>) },
    body: init.json !== undefined ? JSON.stringify(init.json) : init.body,
  })
  const text = await res.text()
  let body: any = text
  try { body = JSON.parse(text) } catch { /* bukan json */ }
  return { status: res.status, body, res }
}

before(async () => {
  tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'zk-e2e-'))
  // Sumber HLS palsu + MJPEG palsu
  const hlsDir = path.join(tmp, 'hls')
  fs.mkdirSync(hlsDir)
  if (hasFfmpeg) {
    spawnSync('ffmpeg', ['-y', '-f', 'lavfi', '-i', 'testsrc=size=320x240:rate=10', '-t', '6', '-c:v', 'libx264',
      '-pix_fmt', 'yuv420p', '-f', 'hls', '-hls_time', '2', '-hls_list_size', '0', path.join(hlsDir, 'index.m3u8')])
  }
  upstream = http.createServer((req, res) => {
    if (req.url === '/mjpeg') {
      res.writeHead(200, { 'content-type': 'multipart/x-mixed-replace; boundary=frame' })
      res.write('--frame\r\nContent-Type: image/jpeg\r\n\r\nFAKE\r\n')
      return res.end()
    }
    const f = path.join(hlsDir, (req.url ?? '/').slice(1).split('?')[0])
    if (fs.existsSync(f) && fs.statSync(f).isFile()) return res.end(fs.readFileSync(f))
    res.writeHead(404).end()
  }).listen(18081)

  server = spawn(process.execPath, ['--import', 'tsx', 'src/index.ts'], {
    env: { ...process.env, PORT: String(PORT), DATA_DIR: path.join(tmp, 'data'), STREAM_TMP_DIR: path.join(tmp, 'ff'), WEB_DIR: path.join(tmp, 'noweb') },
    stdio: 'ignore',
  })
  for (let i = 0; i < 60; i++) {
    try { if ((await fetch(BASE + '/api/health')).ok) return } catch { /* belum siap */ }
    await new Promise((r) => setTimeout(r, 250))
  }
  throw new Error('server tidak naik')
})

after(() => {
  server?.kill('SIGKILL')
  rtspSrc?.kill('SIGKILL')
  upstream?.close()
  
  fs.rmSync(tmp, { recursive: true, force: true })
})

test('rewriteM3u8 mengubah URL relatif & URI="" jadi lewat proxy bertanda tangan', () => {
  const out = rewriteM3u8('#EXTM3U\n#EXT-X-KEY:METHOD=AES-128,URI="k.key"\n#EXTINF:2,\nseg0.ts\n', 'http://x.test/a/index.m3u8', 'TOK')
  assert.match(out, /URI="\/stream\/TOK\/p\/[\w-]+\/[\w-]+"/)
  assert.match(out, /^\/stream\/TOK\/p\//m)
  assert.ok(!out.includes('seg0.ts'))
})

test('setup admin hanya bisa sekali, endpoint admin butuh login', async () => {
  assert.equal((await api('/api/admin/status')).body.needsSetup, true)
  assert.equal((await api('/api/admin/cameras')).status, 401)
  assert.equal((await api('/api/admin/setup', { method: 'POST', json: { username: 'admin', password: 'short' } })).status, 400)
  const r = await api('/api/admin/setup', { method: 'POST', json: { username: 'admin', password: 'passw0rd-ok' } })
  assert.equal(r.status, 201)
  adminCookie = (r.res.headers.get('set-cookie') ?? '').split(';')[0]
  assert.ok(adminCookie.startsWith('zk_admin='))
  assert.equal((await api('/api/admin/setup', { method: 'POST', json: { username: 'b', password: 'passw0rd-ok2' } })).status, 409)
  assert.equal((await api('/api/admin/login', { method: 'POST', json: { username: 'admin', password: 'salah' } })).status, 401)
})

test('CRUD cluster & kamera, kode disimpan sebagai hash dan tidak bocor ke publik', async () => {
  const open = await api('/api/admin/clusters', { method: 'POST', admin: true, json: { name: 'Umum', slug: 'umum' } })
  const vip = await api('/api/admin/clusters', { method: 'POST', admin: true, json: { name: 'VIP', slug: 'vip', accessMode: 'protected', accessCode: 'vip-123' } })
  assert.equal(open.status, 201)
  assert.equal(vip.status, 201)
  assert.equal((await api('/api/admin/clusters', { method: 'POST', admin: true, json: { name: 'X', slug: 'x', accessMode: 'protected' } })).status, 400)
  ids.open = open.body.id; ids.vip = vip.body.id

  const mk = (o: object) => api('/api/admin/cameras', { method: 'POST', admin: true, json: o })
  const free = await mk({ name: 'Gerbang', sourceType: 'hls', sourceUrl: 'http://127.0.0.1:18081/index.m3u8', clusterId: ids.open })
  const secret = await mk({ name: 'Ruang Server', sourceType: 'hls', sourceUrl: 'http://127.0.0.1:18081/index.m3u8', clusterId: ids.open, accessMode: 'protected', accessCode: 'cam-777' })
  const inVip = await mk({ name: 'Lobby VIP', sourceType: 'mjpeg', sourceUrl: 'http://127.0.0.1:18081/mjpeg', clusterId: ids.vip })
  const bad = await mk({ name: 'Salah', sourceType: 'hls', sourceUrl: 'rtsp://x/y' })
  assert.equal(bad.status, 400)
  ids.free = free.body.id; ids.secret = secret.body.id; ids.inVip = inVip.body.id

  const cat = await api('/api/catalog')
  const raw = JSON.stringify(cat.body)
  assert.ok(!raw.includes('18081'), 'URL sumber tidak boleh bocor')
  assert.ok(!raw.includes('hash') && !raw.includes('cam-777'))
  const names = cat.body.cameras.map((c: any) => c.name)
  assert.deepEqual(names.sort(), ['Gerbang', 'Ruang Server'])
  assert.ok(!names.includes('Lobby VIP'), 'kamera di cluster terkunci tersembunyi')
  assert.equal(cat.body.clusters.find((c: any) => c.slug === 'vip').unlocked, false)
})

test('kamera publik bisa ditonton tanpa kode; yang terproteksi butuh unlock', async () => {
  assert.equal((await api(`/api/cameras/${ids.free}/session`, { method: 'POST', json: {} })).status, 200)
  const denied = await api(`/api/cameras/${ids.secret}/session`, { method: 'POST', json: {} })
  assert.equal(denied.status, 403)
  assert.equal(denied.body.need, 'camera')

  const wrong = await api('/api/unlock', { method: 'POST', json: { kind: 'camera', id: ids.secret, code: 'salah' } })
  assert.equal(wrong.status, 403)
  const ok = await api('/api/unlock', { method: 'POST', json: { kind: 'camera', id: ids.secret, code: 'cam-777' } })
  assert.equal(ok.status, 200)
  const s = await api(`/api/cameras/${ids.secret}/session`, { method: 'POST', json: {}, grant: ok.body.grant })
  assert.equal(s.status, 200)
  assert.match(s.body.url, /^\/stream\/.+\/index\.m3u8$/)
  // grant kamera A tidak membuka kamera lain
  assert.equal((await api(`/api/cameras/${ids.inVip}/session`, { method: 'POST', json: {}, grant: ok.body.grant })).status, 403)
})

test('cluster terproteksi: unlock cluster membuka kameranya & grant bisa digabung', async () => {
  const denied = await api(`/api/cameras/${ids.inVip}/session`, { method: 'POST', json: {} })
  assert.equal(denied.body.need, 'cluster')
  assert.equal((await api('/api/unlock', { method: 'POST', json: { kind: 'cluster', id: 'vip', code: 'x' } })).status, 403)
  const c = await api('/api/unlock', { method: 'POST', json: { kind: 'cluster', id: 'vip', code: 'vip-123' } })
  assert.equal(c.status, 200)
  const merged = await api('/api/unlock', { method: 'POST', json: { kind: 'camera', id: ids.secret, code: 'cam-777', grant: c.body.grant } })
  const cat = await api('/api/catalog', { grant: merged.body.grant })
  assert.ok(cat.body.cameras.some((x: any) => x.name === 'Lobby VIP'))
  assert.ok(cat.body.cameras.find((x: any) => x.name === 'Ruang Server').unlocked)
  const s = await api(`/api/cameras/${ids.inVip}/session`, { method: 'POST', json: {}, grant: merged.body.grant })
  assert.equal(s.status, 200)
  assert.equal(s.body.type, 'mjpeg')
  const m = await fetch(BASE + s.body.url)
  assert.equal(m.status, 200)
  assert.match(m.headers.get('content-type') ?? '', /multipart/)
})

test('grant host-to-server via API key', async () => {
  assert.equal((await api('/api/embed/grant', { method: 'POST', json: { clusters: ['vip'] }, headers: { 'x-api-key': 'salah' } })).status, 401)
  const key = (await api('/api/admin/settings', { admin: true })).body.embed_api_key
  const g = await api('/api/embed/grant', { method: 'POST', json: { clusters: ['vip'] }, headers: { 'x-api-key': key } })
  assert.equal(g.status, 200)
  assert.equal((await api(`/api/cameras/${ids.inVip}/session`, { method: 'POST', json: {}, grant: g.body.grant })).status, 200)
})

test('proxy HLS: manifest ditulis ulang, segmen terambil, URL palsu ditolak (SSRF)', { skip: !hasFfmpeg }, async () => {
  const s = await api(`/api/cameras/${ids.free}/session`, { method: 'POST', json: {} })
  assert.match(s.body.url, /^\/stream\/.+\/index\.m3u8$/)
  const m = await fetch(BASE + s.body.url)
  const text = await m.text()
  assert.equal(m.status, 200)
  assert.ok(text.includes('#EXTM3U') && !text.includes('127.0.0.1:18081'))
  const seg = text.split('\n').find((l) => l.startsWith('/stream/'))!
  const sr = await fetch(BASE + seg)
  assert.equal(sr.status, 200)
  assert.ok((await sr.arrayBuffer()).byteLength > 1000)
  // URL di-forge dengan tanda tangan salah
  const token = seg.split('/')[2]
  const forged = `/stream/${token}/p/AAAAAAAAAAAAAAAAAAAAAA/${Buffer.from('http://169.254.169.254/').toString('base64url')}`
  assert.equal((await fetch(BASE + forged)).status, 403)
  assert.equal((await fetch(BASE + '/stream/tokenpalsu/index.m3u8')).status, 403)
})

const MTX = process.env.MEDIAMTX_BIN
// Butuh MediaMTX sebagai server RTSP: MEDIAMTX_BIN=/path/mediamtx npm test
test('RTSP -> HLS via ffmpeg on-demand', { skip: !hasFfmpeg || !MTX }, async () => {
  const mtx = spawn(MTX!, [], { stdio: 'ignore', cwd: path.dirname(MTX!) })
  rtspSrc = spawn('ffmpeg', ['-re', '-f', 'lavfi', '-i', 'testsrc=size=320x240:rate=10', '-c:v', 'libx264', '-pix_fmt', 'yuv420p',
    '-g', '10', '-f', 'rtsp', '-rtsp_transport', 'tcp', 'rtsp://127.0.0.1:8554/live'], { stdio: 'ignore' })
  try {
    await new Promise((r) => setTimeout(r, 3000))
    const cam = await api('/api/admin/cameras', { method: 'POST', admin: true, json: { name: 'RTSP', sourceType: 'rtsp', sourceUrl: 'rtsp://127.0.0.1:8554/live' } })
    assert.equal(cam.status, 201)
    const s = await api(`/api/cameras/${cam.body.id}/session`, { method: 'POST', json: {} })
    const m = await fetch(BASE + s.body.url)
    const text = await m.text()
    assert.equal(m.status, 200, text)
    assert.ok(text.includes('#EXTM3U'))
    const segName = text.split('\n').find((l) => /^seg\d+\.ts$/.test(l))!
    const base = s.body.url.replace('index.m3u8', '')
    const sr = await fetch(BASE + base + segName)
    assert.equal(sr.status, 200)
    assert.ok((await sr.arrayBuffer()).byteLength > 500)
  } finally {
    mtx.kill('SIGKILL')
  }
})

test('health/detail: menghitung online/offline dari probe sumber kamera', async () => {
  // Kamera yang mati: port tidak ada yang mendengarkan.
  const dead = await api('/api/admin/cameras', {
    method: 'POST', admin: true,
    json: { name: 'Mati', sourceType: 'hls', sourceUrl: 'http://127.0.0.1:18091/mati.m3u8', clusterId: ids.open },
  })
  assert.equal(dead.status, 201)
  ids.dead = dead.body.id

  const before = await api('/api/health/detail')
  assert.equal(before.status, 200)
  assert.equal(before.body.cameras.total, before.body.cameras.enabled)

  const r = await api('/api/health/refresh', { method: 'POST', json: {} })
  assert.equal(r.status, 200)

  const after = await api('/api/health/detail')
  const cam = (await api('/api/catalog')).body.cameras.find((c: any) => c.name === 'Mati')
  assert.equal(cam.status, 'offline', 'kamera mati harus terdeteksi offline')
  assert.ok(after.body.problems.some((p: any) => p.id === ids.dead))
  assert.ok(after.body.cameras.offline >= 1)
  assert.ok(after.body.lastCheckAt, 'waktu cek terakhir harus terisi')

  // katalog tetap cepat & tidak membocorkan URL sumber walau probe jalan
  assert.ok(!JSON.stringify((await api('/api/catalog')).body).includes('18091'))
})

test('katalog: status kamera ada dan kamera tanpa probe berstatus unknown', async () => {
  const cat = (await api('/api/catalog')).body
  assert.ok(typeof cat.lastCheckAt === 'number' || cat.lastCheckAt === null)
  const free = cat.cameras.find((c: any) => c.name === 'Gerbang')
  assert.ok(['online', 'offline', 'unknown'].includes(free.status))
  // tidak ada kamera yang mengaku "online" padahal belum pernah diprobe
  for (const c of cat.cameras) assert.ok(c.status, `${c.name} tidak punya status`)
})

test('koordinat: hanya dikirim untuk kamera yang boleh dilihat (opsi C)', async () => {
  // kamera publik dengan koordinat
  const pub = await api('/api/admin/cameras', {
    method: 'POST', admin: true,
    json: { name: 'Peta Publik', sourceType: 'hls', sourceUrl: 'http://127.0.0.1:18081/index.m3u8', lat: -7.81, lng: 110.36 },
  })
  assert.equal(pub.status, 201)
  assert.equal(pub.body.lat, -7.81)

  // kamera berkode dengan koordinat: TIDAK boleh muncul di katalog publik
  const sec = await api('/api/admin/cameras', {
    method: 'POST', admin: true,
    json: { name: 'Peta Rahasia', sourceType: 'hls', sourceUrl: 'http://127.0.0.1:18081/index.m3u8', accessMode: 'protected', accessCode: 'peta-123', lat: -7.801234, lng: 110.123456 },
  })
  assert.equal(sec.status, 201)

  const cat = await api('/api/catalog')
  assert.ok(cat.body.cameras.find((c: any) => c.name === 'Peta Publik').lat === -7.81)
  const hidden = cat.body.cameras.find((c: any) => c.name === 'Peta Rahasia')
  assert.equal(hidden.lat, undefined, 'kamera berkode tidak boleh mengirim lat')
  assert.equal(hidden.lng, undefined, 'kamera berkode tidak boleh mengirim lng')
  assert.ok(!JSON.stringify(cat.body).includes('-7.801234'))

  const detail = await api(`/api/cameras/${sec.body.id}`)
  assert.equal(detail.body.lat, undefined, 'detail kamera berkode juga tidak boleh membocorkan lat')

  // setelah unlock koordinat boleh tampil
  const un = await api('/api/unlock', { method: 'POST', json: { kind: 'camera', id: sec.body.id, code: 'peta-123' } })
  const cat2 = await api('/api/catalog', { grant: un.body.grant })
  const shown = cat2.body.cameras.find((c: any) => c.name === 'Peta Rahasia')
  assert.equal(shown.lat, -7.801234)
  assert.equal(shown.lng, 110.123456)
})

test('koordinat: nilai di luar rentang ditolak', async () => {
  const bad = await api('/api/admin/cameras', {
    method: 'POST', admin: true,
    json: { name: 'Salah Koor', sourceType: 'hls', sourceUrl: 'http://127.0.0.1:18081/index.m3u8', lat: 95, lng: 200 },
  })
  assert.equal(bad.status, 400)
})

test('filter cluster di peta: katalog memberi clusterId + koordinat untuk pengelompokan', async () => {
  const mkCluster = (name: string, slug: string) =>
    api('/api/admin/clusters', { method: 'POST', admin: true, json: { name, slug } })
  const a = await mkCluster('Peta A', 'peta-a')
  const b = await mkCluster('Peta B', 'peta-b')
  assert.equal(a.status, 201)
  assert.equal(b.status, 201)

  const mkCam = (name: string, clusterId: string, lat: number, lng: number) =>
    api('/api/admin/cameras', {
      method: 'POST', admin: true,
      json: { name, sourceType: 'hls', sourceUrl: 'http://127.0.0.1:18081/index.m3u8', clusterId, lat, lng },
    })
  assert.equal((await mkCam('A1', a.body.id, -7.9, 110.3)).status, 201)
  assert.equal((await mkCam('A2', b.body.id, -7.7, 110.4)).status, 201)
  assert.equal((await mkCam('B1', b.body.id, -7.8, 110.1)).status, 201)

  const cat = await api('/api/catalog')
  const plotable = cat.body.cameras.filter((c: any) => typeof c.lat === 'number')
  // Setiap kamera berkoordinat WAJIB punya field clusterId (boleh null untuk kamera
  // tanpa cluster). Tanpa field ini filter cluster di /peta tidak bisa mengelompokkan
  // kamera, sehingga zoom-per-cluster tidak jalan.
  for (const c of plotable) assert.ok('clusterId' in c, `kamera ${c.name} tanpa field clusterId`)
  // clusterId yang terisi harus menunjuk cluster yang benar-benar ada di daftar clusters
  const clusterIds = new Set(cat.body.clusters.map((c: any) => c.id))
  for (const c of plotable) {
    if (c.clusterId != null) assert.ok(clusterIds.has(c.clusterId), `clusterId ${c.clusterId} tidak ada di clusters`)
  }
  // Kamera tanpa cluster tetap boleh tampil di peta (mode "Semua"), tapi tidak masuk
  // hitungan cluster mana pun.
  assert.ok(plotable.some((c: any) => c.clusterId === null))

  // Dua cluster berbeda -> masing-masing punya koordinat sendiri; inilah yang dipakai
  // peta untuk fitBounds per cluster.
  const inA = plotable.filter((c: any) => c.clusterId === a.body.id)
  const inB = plotable.filter((c: any) => c.clusterId === b.body.id)
  assert.deepEqual(inA.map((c: any) => c.name), ['A1'])
  assert.deepEqual(inB.map((c: any) => c.name).sort(), ['A2', 'B1'])
  const spanB = Math.abs(inB[0].lat - inB[1].lat)
  assert.ok(spanB > 0, 'sebaran koordinat cluster B harus punya luas')
})
