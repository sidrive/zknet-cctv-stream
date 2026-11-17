import bcrypt from 'bcryptjs'
import jwt from 'jsonwebtoken'
import type { Request } from 'express'
import { db, getSetting, jwtSecret } from './db.js'

export interface ClusterRow {
  id: string
  slug: string
  name: string
  description: string
  access_mode: 'public' | 'protected'
  access_hash: string | null
  /** Kode terenkripsi untuk ditampilkan lagi ke admin (bukan untuk verifikasi). */
  access_code_enc: string | null
  /** Naik saat akses dicabut; grant dengan versi lama otomatis ditolak. */
  access_version: number
  sort: number
}
export interface CameraRow {
  id: string
  name: string
  description: string
  location: string
  cluster_id: string | null
  source_type: 'hls' | 'mjpeg' | 'rtsp' | 'embed'
  source_url: string
  proxy: number
  transcode: number
  access_mode: 'public' | 'protected'
  access_hash: string | null
  access_code_enc: string | null
  access_version: number
  listed: number
  enabled: number
  sort: number
  lat: number | null
  lng: number | null
}

export const hashCode = (code: string) => bcrypt.hashSync(code, 10)
export const checkCode = (code: string, hash: string | null) =>
  !!hash && bcrypt.compareSync(code, hash)

// ---------- Grant: bukti bahwa viewer sudah membuka kunci cluster/kamera ----------
/**
 * Nilai = versi akses saat grant diterbitkan. Bila admin mencabut akses,
 * `access_version` di database naik sehingga grant lama (versi lebih kecil)
 * langsung tidak berlaku tanpa menunggu masa berlaku token habis.
 */
export interface Grants {
  clusters: Map<string, number>
  cameras: Map<string, number>
}
interface GrantPayload {
  typ: 'grant'
  cl: Record<string, number>
  cam: Record<string, number>
}

export function emptyGrants(): Grants {
  return { clusters: new Map(), cameras: new Map() }
}

export function signGrant(g: Grants, ttlSeconds?: number): string {
  const ttl = ttlSeconds ?? Math.max(1, Number(getSetting('grant_ttl_hours')) || 12) * 3600
  const payload: GrantPayload = {
    typ: 'grant',
    cl: Object.fromEntries(g.clusters),
    cam: Object.fromEntries(g.cameras),
  }
  return jwt.sign(payload, jwtSecret, { expiresIn: ttl })
}

export function parseGrant(token: string | undefined | null): Grants {
  const g = emptyGrants()
  if (!token) return g
  try {
    const p = jwt.verify(token, jwtSecret) as GrantPayload
    if (p.typ !== 'grant') return g
    // Grant lama (sebelum ada pencabutan) berisi array ID tanpa versi: anggap versi 1
    // supaya token yang sudah beredar tetap jalan sampai pencabutan pertama.
    const fill = (target: Map<string, number>, src: unknown) => {
      if (Array.isArray(src)) src.forEach((id) => typeof id === 'string' && target.set(id, 1))
      else if (src && typeof src === 'object') {
        for (const [id, v] of Object.entries(src as Record<string, unknown>)) {
          if (typeof v === 'number') target.set(id, v)
        }
      }
    }
    fill(g.clusters, p.cl)
    fill(g.cameras, p.cam)
  } catch {
    /* token kedaluwarsa/invalid -> dianggap tanpa grant */
  }
  return g
}

export function grantsFromRequest(req: Request): Grants {
  const h = req.header('x-grant')
  const q = typeof req.query.grant === 'string' ? req.query.grant : undefined
  return parseGrant(h || q)
}

// ---------- Aturan akses ----------
export function getCluster(idOrSlug: string): ClusterRow | undefined {
  return db
    .prepare('SELECT * FROM clusters WHERE id = ? OR slug = ?')
    .get(idOrSlug, idOrSlug) as ClusterRow | undefined
}
export function getCamera(id: string): CameraRow | undefined {
  return db.prepare('SELECT * FROM cameras WHERE id = ?').get(id) as CameraRow | undefined
}

/** Grant hanya sah bila versinya sama dengan versi akses saat ini (lihat revoke). */
export const clusterOpen = (c: ClusterRow | undefined | null, g: Grants) =>
  !c || c.access_mode === 'public' || (g.clusters.get(c.id) ?? 0) === (c.access_version ?? 1)

export const cameraOpen = (cam: CameraRow, g: Grants) =>
  cam.access_mode === 'public' || (g.cameras.get(cam.id) ?? 0) === (cam.access_version ?? 1)

/**
 * Kamera hanya bisa ditonton jika:
 *  - cluster-nya terbuka (publik atau sudah di-unlock), DAN
 *  - kamera itu sendiri terbuka (publik atau sudah di-unlock).
 * Kode cluster TIDAK otomatis membuka kamera yang punya kode sendiri.
 */
export function canWatch(cam: CameraRow, g: Grants): { ok: boolean; need?: 'cluster' | 'camera' } {
  const cluster = cam.cluster_id ? getCluster(cam.cluster_id) : undefined
  if (!clusterOpen(cluster, g)) return { ok: false, need: 'cluster' }
  if (!cameraOpen(cam, g)) return { ok: false, need: 'camera' }
  return { ok: true }
}
