import jwt from 'jsonwebtoken'
import type { NextFunction, Request, Response } from 'express'
import { jwtSecret } from './db.js'

export const ADMIN_COOKIE = 'zk_admin'

export function signAdmin(adminId: string, username: string) {
  return jwt.sign({ typ: 'admin', sub: adminId, u: username }, jwtSecret, { expiresIn: '12h' })
}

export function adminFromRequest(req: Request): { id: string; username: string } | null {
  const t = req.cookies?.[ADMIN_COOKIE]
  if (!t) return null
  try {
    const p = jwt.verify(t, jwtSecret) as { typ: string; sub: string; u: string }
    if (p.typ !== 'admin') return null
    return { id: p.sub, username: p.u }
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
