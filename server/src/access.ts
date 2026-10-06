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
  listed: number
  enabled: number
  sort: number
}

export const hashCode = (code: string) => bcrypt.hashSync(code, 10)
export const checkCode = (code: string, hash: string | null) =>
  !!hash && bcrypt.compareSync(code, hash)

// ---------- Grant: bukti bahwa viewer sudah membuka kunci cluster/kamera ----------
export interface Grants {
  clusters: Set<string>
  cameras: Set<string>
}
interface GrantPayload {
  typ: 'grant'
  cl: string[]
  cam: string[]
}

export function emptyGrants(): Grants {
  return { clusters: new Set(), cameras: new Set() }
}

export function signGrant(g: Grants, ttlSeconds?: number): string {
  const ttl = ttlSeconds ?? Math.max(1, Number(getSetting('grant_ttl_hours')) || 12) * 3600
  const payload: GrantPayload = { typ: 'grant', cl: [...g.clusters], cam: [...g.cameras] }
  return jwt.sign(payload, jwtSecret, { expiresIn: ttl })
}

export function parseGrant(token: string | undefined | null): Grants {
  const g = emptyGrants()
  if (!token) return g
  try {
    const p = jwt.verify(token, jwtSecret) as GrantPayload
    if (p.typ !== 'grant') return g
    p.cl?.forEach((x) => g.clusters.add(x))
    p.cam?.forEach((x) => g.cameras.add(x))
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

export const clusterOpen = (c: ClusterRow | undefined | null, g: Grants) =>
  !c || c.access_mode === 'public' || g.clusters.has(c.id)

export const cameraOpen = (cam: CameraRow, g: Grants) =>
  cam.access_mode === 'public' || g.cameras.has(cam.id)

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
