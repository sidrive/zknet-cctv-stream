import { Router } from 'express';
import bcrypt from 'bcryptjs';
import rateLimit from 'express-rate-limit';
import crypto from 'node:crypto';
import { z } from 'zod';
import { hashCode } from './access.js';
import { ADMIN_COOKIE, adminFromRequest, requireAdmin, signAdmin } from './auth.js';
import { config } from './config.js';
import { db, EDITABLE_SETTING_KEYS, embedApiKey, getSetting, newId, setSetting } from './db.js';
import { ffmpeg } from './ffmpeg.js';
export const adminRouter = Router();
const loginLimiter = rateLimit({
    windowMs: 15 * 60_000,
    limit: 20,
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: 'Terlalu banyak percobaan login. Coba lagi nanti.' },
});
const cookieOpts = () => ({
    httpOnly: true,
    sameSite: 'strict',
    secure: config.cookieSecure,
    maxAge: 12 * 3600_000,
    path: '/',
});
const adminCount = () => db.prepare('SELECT COUNT(*) c FROM admins').get().c;
// ---------- Setup admin pertama & login ----------
adminRouter.get('/status', (req, res) => {
    const a = adminFromRequest(req);
    res.json({
        needsSetup: adminCount() === 0,
        setupTokenRequired: !!config.setupToken,
        admin: a ? { username: a.username } : null,
    });
});
const credentials = z.object({
    username: z.string().trim().min(3).max(40).regex(/^[\w.-]+$/, 'Hanya huruf, angka, titik, minus, underscore'),
    password: z.string().min(8, 'Minimal 8 karakter').max(200),
});
adminRouter.post('/setup', loginLimiter, (req, res) => {
    // Hanya boleh saat belum ada admin sama sekali.
    if (adminCount() > 0)
        return res.status(409).json({ error: 'Setup sudah dilakukan' });
    if (config.setupToken) {
        const given = Buffer.from(String(req.body?.setupToken ?? ''));
        const want = Buffer.from(config.setupToken);
        if (given.length !== want.length || !crypto.timingSafeEqual(given, want)) {
            return res.status(403).json({ error: 'Setup token salah' });
        }
    }
    const p = credentials.safeParse(req.body);
    if (!p.success)
        return res.status(400).json({ error: p.error.issues[0].message });
    const id = newId();
    db.prepare('INSERT INTO admins(id,username,password_hash) VALUES(?,?,?)').run(id, p.data.username, bcrypt.hashSync(p.data.password, 12));
    res.cookie(ADMIN_COOKIE, signAdmin(id, p.data.username), cookieOpts());
    res.status(201).json({ ok: true });
});
adminRouter.post('/login', loginLimiter, (req, res) => {
    const p = credentials.pick({ username: true }).extend({ password: z.string().min(1) }).safeParse(req.body);
    if (!p.success)
        return res.status(400).json({ error: 'Input tidak valid' });
    const row = db.prepare('SELECT * FROM admins WHERE username = ?').get(p.data.username);
    const ok = bcrypt.compareSync(p.data.password, row?.password_hash ?? '$2a$12$invalidinvalidinvalidinvalidinvalidinvalidinvalidinvalidinv');
    if (!row || !ok)
        return res.status(401).json({ error: 'Username atau password salah' });
    res.cookie(ADMIN_COOKIE, signAdmin(row.id, row.username), cookieOpts());
    res.json({ ok: true });
});
adminRouter.post('/logout', (_req, res) => {
    res.clearCookie(ADMIN_COOKIE, { path: '/' });
    res.json({ ok: true });
});
// Semua di bawah ini wajib admin.
adminRouter.use(requireAdmin);
adminRouter.post('/password', (req, res) => {
    const p = z.object({ current: z.string(), next: credentials.shape.password }).safeParse(req.body);
    if (!p.success)
        return res.status(400).json({ error: p.error.issues[0].message });
    const me = req.admin;
    const row = db.prepare('SELECT password_hash FROM admins WHERE id = ?').get(me.id);
    if (!bcrypt.compareSync(p.data.current, row.password_hash))
        return res.status(403).json({ error: 'Password saat ini salah' });
    db.prepare('UPDATE admins SET password_hash = ? WHERE id = ?').run(bcrypt.hashSync(p.data.next, 12), me.id);
    res.json({ ok: true });
});
// ---------- Cluster ----------
const accessFields = {
    accessMode: z.enum(['public', 'protected']).default('public'),
    // Kosong saat edit = pertahankan kode lama. Wajib saat protected & belum ada kode.
    accessCode: z.string().max(200).optional(),
};
const clusterBody = z.object({
    name: z.string().trim().min(1).max(100),
    slug: z.string().trim().toLowerCase().min(2).max(60).regex(/^[a-z0-9-]+$/, 'Slug: a-z, 0-9, minus'),
    description: z.string().max(500).default(''),
    sort: z.number().int().default(0),
    ...accessFields,
});
const clusterOut = (c) => ({
    id: c.id, slug: c.slug, name: c.name, description: c.description, sort: c.sort,
    accessMode: c.access_mode, hasCode: !!c.access_hash,
    cameraCount: db.prepare('SELECT COUNT(*) n FROM cameras WHERE cluster_id = ?').get(c.id).n,
});
adminRouter.get('/clusters', (_req, res) => {
    const rows = db.prepare('SELECT * FROM clusters ORDER BY sort, name').all();
    res.json(rows.map(clusterOut));
});
function resolveHash(mode, code, oldHash) {
    if (mode === 'public')
        return { hash: null };
    if (code)
        return { hash: hashCode(code) };
    if (oldHash)
        return { hash: oldHash };
    return { error: 'Kode akses wajib diisi untuk akses terproteksi' };
}
adminRouter.post('/clusters', (req, res) => {
    const p = clusterBody.safeParse(req.body);
    if (!p.success)
        return res.status(400).json({ error: p.error.issues[0].message });
    const h = resolveHash(p.data.accessMode, p.data.accessCode, null);
    if ('error' in h)
        return res.status(400).json({ error: h.error });
    if (db.prepare('SELECT 1 FROM clusters WHERE slug = ?').get(p.data.slug)) {
        return res.status(409).json({ error: 'Slug sudah dipakai' });
    }
    const id = newId();
    db.prepare('INSERT INTO clusters(id,slug,name,description,access_mode,access_hash,sort) VALUES(?,?,?,?,?,?,?)').run(id, p.data.slug, p.data.name, p.data.description, p.data.accessMode, h.hash, p.data.sort);
    res.status(201).json(clusterOut(db.prepare('SELECT * FROM clusters WHERE id = ?').get(id)));
});
adminRouter.put('/clusters/:id', (req, res) => {
    const old = db.prepare('SELECT * FROM clusters WHERE id = ?').get(req.params.id);
    if (!old)
        return res.status(404).json({ error: 'Cluster tidak ditemukan' });
    const p = clusterBody.safeParse(req.body);
    if (!p.success)
        return res.status(400).json({ error: p.error.issues[0].message });
    const h = resolveHash(p.data.accessMode, p.data.accessCode, old.access_hash);
    if ('error' in h)
        return res.status(400).json({ error: h.error });
    const dup = db.prepare('SELECT id FROM clusters WHERE slug = ? AND id != ?').get(p.data.slug, old.id);
    if (dup)
        return res.status(409).json({ error: 'Slug sudah dipakai' });
    db.prepare('UPDATE clusters SET slug=?,name=?,description=?,access_mode=?,access_hash=?,sort=? WHERE id=?').run(p.data.slug, p.data.name, p.data.description, p.data.accessMode, h.hash, p.data.sort, old.id);
    res.json(clusterOut(db.prepare('SELECT * FROM clusters WHERE id = ?').get(old.id)));
});
adminRouter.delete('/clusters/:id', (req, res) => {
    // Kamera di dalamnya TIDAK dihapus; cluster_id menjadi NULL (ON DELETE SET NULL).
    // Perhatian: kamera ikut menjadi tidak terikat cluster -> aturan akses cluster hilang.
    const r = db.prepare('DELETE FROM clusters WHERE id = ?').run(req.params.id);
    if (!r.changes)
        return res.status(404).json({ error: 'Cluster tidak ditemukan' });
    res.json({ ok: true });
});
// ---------- Kamera ----------
const SCHEMES = {
    hls: /^https?:\/\//i,
    mjpeg: /^https?:\/\//i,
    embed: /^https?:\/\//i,
    rtsp: /^(rtsps?|rtmps?|srt|https?):\/\//i,
};
const cameraBody = z
    .object({
    name: z.string().trim().min(1).max(100),
    description: z.string().max(500).default(''),
    location: z.string().max(200).default(''),
    clusterId: z.string().nullable().default(null),
    sourceType: z.enum(['hls', 'mjpeg', 'rtsp', 'embed']),
    sourceUrl: z.string().trim().min(1).max(2000),
    proxy: z.boolean().default(true),
    transcode: z.boolean().default(false),
    listed: z.boolean().default(true),
    enabled: z.boolean().default(true),
    sort: z.number().int().default(0),
    ...accessFields,
})
    .refine((v) => SCHEMES[v.sourceType].test(v.sourceUrl), {
    message: 'URL sumber tidak sesuai tipe (hls/mjpeg/embed: http(s); rtsp: rtsp/rtmp/srt/http)',
    path: ['sourceUrl'],
});
const cameraOut = (c) => ({
    id: c.id, name: c.name, description: c.description, location: c.location,
    clusterId: c.cluster_id, sourceType: c.source_type, sourceUrl: c.source_url,
    proxy: !!c.proxy, transcode: !!c.transcode, listed: !!c.listed, enabled: !!c.enabled, sort: c.sort,
    accessMode: c.access_mode, hasCode: !!c.access_hash,
});
adminRouter.get('/cameras', (_req, res) => {
    const rows = db.prepare('SELECT * FROM cameras ORDER BY sort, name').all();
    res.json(rows.map(cameraOut));
});
function clusterExists(id) {
    return id === null || !!db.prepare('SELECT 1 FROM clusters WHERE id = ?').get(id);
}
adminRouter.post('/cameras', (req, res) => {
    const p = cameraBody.safeParse(req.body);
    if (!p.success)
        return res.status(400).json({ error: p.error.issues[0].message });
    const d = p.data;
    if (!clusterExists(d.clusterId))
        return res.status(400).json({ error: 'Cluster tidak ditemukan' });
    const h = resolveHash(d.accessMode, d.accessCode, null);
    if ('error' in h)
        return res.status(400).json({ error: h.error });
    const id = newId();
    db.prepare(`INSERT INTO cameras(id,name,description,location,cluster_id,source_type,source_url,proxy,transcode,access_mode,access_hash,listed,enabled,sort)
     VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?)`).run(id, d.name, d.description, d.location, d.clusterId, d.sourceType, d.sourceUrl, +d.proxy, +d.transcode, d.accessMode, h.hash, +d.listed, +d.enabled, d.sort);
    res.status(201).json(cameraOut(db.prepare('SELECT * FROM cameras WHERE id = ?').get(id)));
});
adminRouter.put('/cameras/:id', (req, res) => {
    const old = db.prepare('SELECT * FROM cameras WHERE id = ?').get(req.params.id);
    if (!old)
        return res.status(404).json({ error: 'Kamera tidak ditemukan' });
    const p = cameraBody.safeParse(req.body);
    if (!p.success)
        return res.status(400).json({ error: p.error.issues[0].message });
    const d = p.data;
    if (!clusterExists(d.clusterId))
        return res.status(400).json({ error: 'Cluster tidak ditemukan' });
    const h = resolveHash(d.accessMode, d.accessCode, old.access_hash);
    if ('error' in h)
        return res.status(400).json({ error: h.error });
    db.prepare(`UPDATE cameras SET name=?,description=?,location=?,cluster_id=?,source_type=?,source_url=?,proxy=?,transcode=?,
       access_mode=?,access_hash=?,listed=?,enabled=?,sort=? WHERE id=?`).run(d.name, d.description, d.location, d.clusterId, d.sourceType, d.sourceUrl, +d.proxy, +d.transcode, d.accessMode, h.hash, +d.listed, +d.enabled, d.sort, old.id);
    ffmpeg.stop(old.id); // sumber mungkin berubah -> restart saat ditonton lagi
    res.json(cameraOut(db.prepare('SELECT * FROM cameras WHERE id = ?').get(old.id)));
});
adminRouter.delete('/cameras/:id', (req, res) => {
    const r = db.prepare('DELETE FROM cameras WHERE id = ?').run(req.params.id);
    if (!r.changes)
        return res.status(404).json({ error: 'Kamera tidak ditemukan' });
    ffmpeg.stop(req.params.id);
    res.json({ ok: true });
});
// ---------- Pengaturan ----------
adminRouter.get('/settings', (_req, res) => {
    const out = {};
    for (const k of EDITABLE_SETTING_KEYS)
        out[k] = getSetting(k);
    res.json({ ...out, embed_api_key: embedApiKey(), active_transcoders: String(ffmpeg.activeCount()) });
});
adminRouter.put('/settings', (req, res) => {
    const p = z
        .object({
        site_title: z.string().trim().min(1).max(100),
        site_description: z.string().max(300),
        embed_origins: z.string().max(2000),
        grant_ttl_hours: z.coerce.number().int().min(1).max(720),
    })
        .safeParse(req.body);
    if (!p.success)
        return res.status(400).json({ error: p.error.issues[0].message });
    for (const [k, v] of Object.entries(p.data))
        setSetting(k, String(v));
    res.json({ ok: true });
});
adminRouter.post('/settings/rotate-api-key', (_req, res) => {
    setSetting('embed_api_key', '');
    res.json({ embed_api_key: embedApiKey() });
});
