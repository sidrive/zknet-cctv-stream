import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { db, getSetting, jwtSecret } from './db.js';
export const hashCode = (code) => bcrypt.hashSync(code, 10);
export const checkCode = (code, hash) => !!hash && bcrypt.compareSync(code, hash);
export function emptyGrants() {
    return { clusters: new Set(), cameras: new Set() };
}
export function signGrant(g, ttlSeconds) {
    const ttl = ttlSeconds ?? Math.max(1, Number(getSetting('grant_ttl_hours')) || 12) * 3600;
    const payload = { typ: 'grant', cl: [...g.clusters], cam: [...g.cameras] };
    return jwt.sign(payload, jwtSecret, { expiresIn: ttl });
}
export function parseGrant(token) {
    const g = emptyGrants();
    if (!token)
        return g;
    try {
        const p = jwt.verify(token, jwtSecret);
        if (p.typ !== 'grant')
            return g;
        p.cl?.forEach((x) => g.clusters.add(x));
        p.cam?.forEach((x) => g.cameras.add(x));
    }
    catch {
        /* token kedaluwarsa/invalid -> dianggap tanpa grant */
    }
    return g;
}
export function grantsFromRequest(req) {
    const h = req.header('x-grant');
    const q = typeof req.query.grant === 'string' ? req.query.grant : undefined;
    return parseGrant(h || q);
}
// ---------- Aturan akses ----------
export function getCluster(idOrSlug) {
    return db
        .prepare('SELECT * FROM clusters WHERE id = ? OR slug = ?')
        .get(idOrSlug, idOrSlug);
}
export function getCamera(id) {
    return db.prepare('SELECT * FROM cameras WHERE id = ?').get(id);
}
export const clusterOpen = (c, g) => !c || c.access_mode === 'public' || g.clusters.has(c.id);
export const cameraOpen = (cam, g) => cam.access_mode === 'public' || g.cameras.has(cam.id);
/**
 * Kamera hanya bisa ditonton jika:
 *  - cluster-nya terbuka (publik atau sudah di-unlock), DAN
 *  - kamera itu sendiri terbuka (publik atau sudah di-unlock).
 * Kode cluster TIDAK otomatis membuka kamera yang punya kode sendiri.
 */
export function canWatch(cam, g) {
    const cluster = cam.cluster_id ? getCluster(cam.cluster_id) : undefined;
    if (!clusterOpen(cluster, g))
        return { ok: false, need: 'cluster' };
    if (!cameraOpen(cam, g))
        return { ok: false, need: 'camera' };
    return { ok: true };
}
