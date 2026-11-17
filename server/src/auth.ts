import jwt from 'jsonwebtoken'
import type { NextFunction, Request, Response } from 'express'
import { db, jwtSecret } from './db.js'

export const ADMIN_COOKIE = 'zk_admin'

/** `tv` = token_version akun saat cookie dibuat; naikkan untuk memaksa login ulang. */
export function signAdmin(adminId: string, username: string, tokenVersion = 1) {
  return jwt.sign({ typ: 'admin', sub: adminId, u: username, tv: tokenVersion }, jwtSecret, { expiresIn: '12h' })
}

export function adminFromRequest(req: Request): { id: string; username: string } | null {
  const t = req.cookies?.[ADMIN_COOKIE]
  if (!t) return null
  try {
    const p = jwt.verify(t, jwtSecret) as { typ: string; sub: string; u: string; tv?: number }
    if (p.typ !== 'admin') return null
    // Cek ke database supaya admin yang dihapus atau dikeluarkan segera kehilangan akses,
    // tidak menunggu cookie 12 jam kedaluwarsa.
    const row = db.prepare('SELECT username, token_version FROM admins WHERE id = ?').get(p.sub) as
      | { username: string; token_version: number } | undefined
    if (!row) return null
        // Cookie lama (sebelum ada token_version) dianggap versi 1 agar update ini tidak
    // memaksa semua admin login ulang.
    if ((p.tv ?? 1) !== (row.token_version ?? 1)) return null
    return { id: p.sub, username: row.username }
  } catch {
    return null
  }
}

export function requireAdmin(req: Request, res: Response, next: NextFunction) {
  const a = adminFromRequest(req)
  if (!a) return res.status(401).json({ error: 'Perlu login admin' })
  ;(req as Request & { admin?: typeof a }).admin = a
  next()
}

// Cookie SameSite=Strict + API hanya menerima JSON => cukup untuk mencegah CSRF di panel admin.
export function requireJson(req: Request, res: Response, next: NextFunction) {
  if (['POST', 'PUT', 'PATCH', 'DELETE'].includes(req.method) && req.headers['content-length'] !== '0') {
    if (!req.is('application/json')) return res.status(415).json({ error: 'Content-Type harus application/json' })
  }
  next()
}
