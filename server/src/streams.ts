import { Router } from 'express'
import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import { Readable } from 'node:stream'
import jwt from 'jsonwebtoken'
import { getCamera, type CameraRow } from './access.js'
import { jwtSecret } from './db.js'
import { ffmpeg } from './ffmpeg.js'

const STREAM_TTL = '6h'

export function signStreamToken(camId: string) {
  return jwt.sign({ typ: 'stream', cam: camId }, jwtSecret, { expiresIn: STREAM_TTL })
}

function camFromToken(token: string): CameraRow | null {
  try {
    const p = jwt.verify(token, jwtSecret) as { typ: string; cam: string }
    if (p.typ !== 'stream') return null
    const cam = getCamera(p.cam)
    return cam && cam.enabled ? cam : null
  } catch {
    return null
  }
}

// Tanda tangan URL upstream agar klien tidak bisa menyuruh server mengambil URL sembarang (SSRF).
const sig = (url: string) =>
  crypto.createHmac('sha256', jwtSecret).update(url).digest('base64url').slice(0, 22)

function proxied(token: string, absUrl: string) {
  return `/stream/${token}/p/${sig(absUrl)}/${Buffer.from(absUrl).toString('base64url')}`
}

export function rewriteM3u8(body: string, baseUrl: string, token: string): string {
  const abs = (u: string) => new URL(u, baseUrl).toString()
  return body
    .split(/\r?\n/)
    .map((line) => {
      if (!line.trim()) return line
      if (line.startsWith('#')) {
        return line.replace(/URI="([^"]+)"/g, (_m, u) => `URI="${proxied(token, abs(u))}"`)
      }
      return proxied(token, abs(line.trim()))
    })
    .join('\n')
}

const noStore = (res: import('express').Response) => res.setHeader('Cache-Control', 'no-store')
const isM3u8 = (url: string, ctype: string | null) =>
  /\.m3u8(\?|$)/i.test(url) || /mpegurl/i.test(ctype ?? '')

async function fetchUpstream(url: string, req: import('express').Request) {
  const ac = new AbortController()
  req.on('close', () => ac.abort())
  const t = setTimeout(() => ac.abort(), 15000)
  try {
    const r = await fetch(url, {
      signal: ac.signal,
      redirect: 'follow',
      headers: { 'user-agent': 'zknet-cctv-proxy/1.0' },
    })
    return { r, ac }
  } finally {
    clearTimeout(t)
  }
}

export const streamRouter = Router()

// HLS dari sumber upstream (proxy) atau hasil ffmpeg (rtsp).
streamRouter.get('/:token/index.m3u8', async (req, res) => {
  const cam = camFromToken(req.params.token)
  if (!cam) return res.status(403).end()
  noStore(res)
  try {
    if (cam.source_type === 'rtsp') {
      await ffmpeg.ensure(cam)
      ffmpeg.touch(cam.id)
      const file = path.join(ffmpeg.dirFor(cam.id), 'index.m3u8')
      res.type('application/vnd.apple.mpegurl').send(fs.readFileSync(file))
      return
    }
    if (cam.source_type !== 'hls') return res.status(400).end()
    const { r } = await fetchUpstream(cam.source_url, req)
    if (!r.ok) return res.status(502).json({ error: `Sumber merespons ${r.status}` })
    const text = await r.text()
    res.type('application/vnd.apple.mpegurl').send(rewriteM3u8(text, r.url || cam.source_url, req.params.token))
  } catch (e) {
    res.status(502).json({ error: (e as Error).message })
  }
})

// Segmen hasil ffmpeg.
streamRouter.get('/:token/:file', (req, res, next) => {
  if (!/^seg\d+\.ts$/.test(req.params.file)) return next()
  const cam = camFromToken(req.params.token)
  if (!cam || cam.source_type !== 'rtsp') return res.status(403).end()
  ffmpeg.touch(cam.id)
  const file = path.join(ffmpeg.dirFor(cam.id), req.params.file)
  if (!fs.existsSync(file)) return res.status(404).end()
  noStore(res)
  res.type('video/mp2t')
  fs.createReadStream(file).pipe(res)
})

// Sub-playlist / segmen / key dari upstream HLS.
streamRouter.get('/:token/p/:sig/:enc', async (req, res) => {
  const cam = camFromToken(req.params.token)
  if (!cam || cam.source_type !== 'hls') return res.status(403).end()
  let url: string
  try {
    url = Buffer.from(req.params.enc, 'base64url').toString()
  } catch {
    return res.status(400).end()
  }
  const expected = sig(url)
  const given = Buffer.from(req.params.sig)
  if (given.length !== expected.length || !crypto.timingSafeEqual(given, Buffer.from(expected))) {
    return res.status(403).end()
  }
  if (!/^https?:\/\//i.test(url)) return res.status(400).end()
  noStore(res)
  try {
    const { r } = await fetchUpstream(url, req)
    if (!r.ok) return res.status(502).end()
    const ctype = r.headers.get('content-type')
    if (isM3u8(url, ctype)) {
      res.type('application/vnd.apple.mpegurl').send(rewriteM3u8(await r.text(), r.url || url, req.params.token))
      return
    }
    if (ctype) res.type(ctype)
    if (!r.body) return res.end()
    Readable.fromWeb(r.body as never).on('error', () => res.destroy()).pipe(res)
  } catch (e) {
    if (!res.headersSent) res.status(502).json({ error: (e as Error).message })
  }
})

// MJPEG diteruskan apa adanya (kredensial sumber tetap di server).
streamRouter.get('/:token/mjpeg', async (req, res) => {
  const cam = camFromToken(req.params.token)
  if (!cam || cam.source_type !== 'mjpeg') return res.status(403).end()
  noStore(res)
  const ac = new AbortController()
  res.on('close', () => ac.abort())
  try {
    const r = await fetch(cam.source_url, { signal: ac.signal, headers: { 'user-agent': 'zknet-cctv-proxy/1.0' } })
    if (!r.ok || !r.body) return res.status(502).end()
    res.type(r.headers.get('content-type') || 'multipart/x-mixed-replace')
    Readable.fromWeb(r.body as never).on('error', () => res.destroy()).pipe(res)
  } catch {
    if (!res.headersSent) res.status(502).end()
  }
})
