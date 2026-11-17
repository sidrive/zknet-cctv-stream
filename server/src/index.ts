import express from 'express'
import cookieParser from 'cookie-parser'
import helmet from 'helmet'
import fs from 'node:fs'
import path from 'node:path'
import { config } from './config.js'
import { getSetting } from './db.js'
import { requireJson } from './auth.js'
import { adminRouter } from './adminRoutes.js'
import { publicRouter } from './publicRoutes.js'
import { streamRouter } from './streams.js'
import { ffmpeg } from './ffmpeg.js'
import { refreshProbes } from './health.js'

const app = express()
app.disable('x-powered-by')
if (config.trustProxy) app.set('trust proxy', 1)

// CSP disusun manual agar frame-ancestors bisa dinamis untuk halaman /embed.
app.use(helmet({ contentSecurityPolicy: false, frameguard: false }))
app.use((req, res, next) => {
  let ancestors = "'self'"
  if (req.path.startsWith('/embed')) {
    const origins = getSetting('embed_origins').split(/[\s,]+/).filter(Boolean)
    ancestors = origins.length ? origins.join(' ') : '*'
  }
  res.setHeader(
    'Content-Security-Policy',
    [
      "default-src 'self'",
      "script-src 'self'",
      // MapLibre membuat Web Worker dari blob URL untuk merender tile vektor.
      // Tanpa worker-src, aturan jatuh ke default-src 'self' dan worker diblokir
      // (peta tampil hitam tanpa jalan).
      "worker-src 'self' blob:",
      "style-src 'self' 'unsafe-inline'",
      "img-src 'self' data: blob: http: https:",
      "media-src 'self' blob: http: https:",
      "connect-src 'self' http: https:",
      'frame-src http: https:',
      `frame-ancestors ${ancestors}`,
      "object-src 'none'",
      "base-uri 'self'",
    ].join('; '),
  )
  next()
})

// Loader mini-app harus bisa dimuat dari origin aplikasi host (helmet default: same-origin).
app.get('/embed.js', (_req, res, next) => {
  res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin')
  next()
})

app.use(cookieParser())
app.use('/api', express.json({ limit: '50kb' }), requireJson)
app.use('/api/admin', adminRouter)
app.use('/api', publicRouter)
app.use('/stream', streamRouter)
app.use('/api', (_req, res) => res.status(404).json({ error: 'Endpoint tidak ditemukan' }))

// Frontend (SPA) hasil build.
if (fs.existsSync(config.webDir)) {
  app.use(express.static(config.webDir, { index: false, maxAge: '1h' }))
  // Semua rute SPA yang dikenal tetap 200; selain itu 404 supaya URL salah tidak
  // tampil sebagai "sehat" di log/monitoring. Halaman 404-nya tetap dari SPA.
  const spaRoutes = [/^\/$/, /^\/c\/[^/]+\/?$/, /^\/v\/[^/]+\/?$/, /^\/status\/?$/, /^\/peta\/?$/, /^\/cluster\/?$/, /^\/embed\/?$/, /^\/admin(\/.*)?$/]
  app.get('*', (req, res) => {
    const known = spaRoutes.some((re) => re.test(req.path))
    res.status(known ? 200 : 404).sendFile(path.join(config.webDir, 'index.html'))
  })
} else {
  app.get('/', (_req, res) => res.type('text').send('Frontend belum di-build. Jalankan: npm run build'))
}

app.use((err: Error, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  console.error(err.message)
  res.status(500).json({ error: 'Terjadi kesalahan server' })
})

const server = app.listen(config.port, () => {
  console.log(`CCTV stream hub berjalan di http://localhost:${config.port}`)
})

// Probe kesehatan sumber kamera: sekali saat start, lalu tiap interval cache.
// Dijalankan di latar belakang agar request katalog tidak ikut menunggu.
let probeTimer: NodeJS.Timeout | undefined
if (config.probeCacheSeconds > 0) {
  const tick = () => {
    refreshProbes().catch((e) => console.error('probe gagal:', e instanceof Error ? e.message : e))
  }
  setTimeout(tick, 2000).unref()
  probeTimer = setInterval(tick, config.probeCacheSeconds * 1000)
  probeTimer.unref()
}

const shutdown = () => {
  if (probeTimer) clearInterval(probeTimer)
  ffmpeg.stopAll()
  server.close(() => process.exit(0))
  setTimeout(() => process.exit(0), 3000).unref()
}
process.on('SIGINT', shutdown)
process.on('SIGTERM', shutdown)
