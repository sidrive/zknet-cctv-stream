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
import { decryptCode, encryptCode, generateCode } from './secrets.js';
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
    db.prepare("INSERT INTO admins(id,username,password_hash,last_login_at) VALUES(?,?,?,datetime('now'))").run(id, p.data.username, bcrypt.hashSync(p.data.password, 12));
    res.cookie(ADMIN_COOKIE, signAdmin(id, p.data.username, 1), cookieOpts());
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
    db.prepare("UPDATE admins SET last_login_at = datetime('now') WHERE id = ?").run(row.id);
    res.cookie(ADMIN_COOKIE, signAdmin(row.id, row.username, row.token_version ?? 1), cookieOpts());
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
    const row = db.prepare('SELECT password_hash, token_version FROM admins WHERE id = ?').get(me.id);
    if (!row || !bcrypt.compareSync(p.data.current, row.password_hash))
        return res.status(403).json({ error: 'Password saat ini salah' });
    // Naikkan token_version: sesi lain (mis. di perangkat lain) ikut keluar, lalu cookie
    // sesi ini diperbarui agar admin yang mengganti password tidak ikut terlempar.
    const tv = (row.token_version ?? 1) + 1;
    db.prepare('UPDATE admins SET password_hash = ?, token_version = ? WHERE id = ?').run(bcrypt.hashSync(p.data.next, 12), tv, me.id);
    res.cookie(ADMIN_COOKIE, signAdmin(me.id, me.username, tv), cookieOpts());
    res.json({ ok: true });
});
const meOf = (req) => req.admin;
const adminCountExcept = (id) => db.prepare('SELECT COUNT(*) c FROM admins WHERE id <> ?').get(id).c;
adminRouter.get('/users', (_req, res) => {
    const me = meOf(_req);
    const rows = db.prepare('SELECT id, username, created_at, last_login_at, token_version FROM admins ORDER BY created_at').all();
    res.json(rows.map((r) => ({
        id: r.id,
        username: r.username,
        createdAt: r.created_at,
        lastLoginAt: r.last_login_at,
        isYou: r.id === me.id,
    })));
});
adminRouter.post('/users', (req, res) => {
    const p = credentials.safeParse(req.body);
    if (!p.success)
        return res.status(400).json({ error: p.error.issues[0].message });
    if (db.prepare('SELECT 1 FROM admins WHERE username = ?').get(p.data.username)) {
        return res.status(409).json({ error: 'Username sudah dipakai' });
    }
    const id = newId();
    db.prepare('INSERT INTO admins(id,username,password_hash) VALUES(?,?,?)').run(id, p.data.username, bcrypt.hashSync(p.data.password, 12));
    res.status(201).json({ id, username: p.data.username });
});
const newPassword = z.object({ password: credentials.shape.password });
adminRouter.post('/users/:id/password', (req, res) => {
    const me = meOf(req);
    if (req.params.id === me.id)
        return res.status(400).json({ error: 'Untuk akun sendiri, pakai Ganti password (perlu password lama)' });
    const p = newPassword.safeParse(req.body);
    if (!p.success)
        return res.status(400).json({ error: p.error.issues[0].message });
    const row = db.prepare('SELECT token_version FROM admins WHERE id = ?').get(req.params.id);
    if (!row)
        return res.status(404).json({ error: 'Admin tidak ditemukan' });
    // Sesi lama akun itu ikut gugur supaya password baru benar-benar berlaku.
    db.prepare('UPDATE admins SET password_hash = ?, token_version = ? WHERE id = ?')
        .run(bcrypt.hashSync(p.data.password, 12), (row.token_version ?? 1) + 1, req.params.id);
    res.json({ ok: true });
});
adminRouter.post('/users/:id/kick', (req, res) => {
    const me = meOf(req);
    if (req.params.id === me.id)
        return res.status(400).json({ error: 'Itu akun Anda sendiri. Gunakan tombol Keluar untuk mengakhiri sesi ini.' });
    const row = db.prepare('SELECT token_version FROM admins WHERE id = ?').get(req.params.id);
    if (!row)
        return res.status(404).json({ error: 'Admin tidak ditemukan' });
    db.prepare('UPDATE admins SET token_version = ? WHERE id = ?').run((row.token_version ?? 1) + 1, req.params.id);
    res.json({ ok: true });
});
adminRouter.delete('/users/:id', (req, res) => {
    const me = meOf(req);
    if (req.params.id === me.id)
        return res.status(400).json({ error: 'Tidak bisa menghapus akun sendiri' });
    const row = db.prepare('SELECT username FROM admins WHERE id = ?').get(req.params.id);
    if (!row)
        return res.status(404).json({ error: 'Admin tidak ditemukan' });
    // Jangan pernah sampai tidak ada admin tersisa — panel jadi tidak bisa dibuka lagi.
    if (adminCountExcept(req.params.id) === 0)
        return res.status(409).json({ error: 'Tidak bisa menghapus admin terakhir' });
    db.prepare('DELETE FROM admins WHERE id = ?').run(req.params.id);
    res.json({ ok: true, deleted: row.username });
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
    // true bila kode tersimpan terenkripsi, jadi admin bisa membacanya lagi untuk dibagikan.
    // false = kode dibuat sebelum fitur ini ada, atau cuma hash lama.
    codeViewable: !!c.access_code_enc && !!(c.access_hash),
    accessVersion: c.access_version ?? 1,
    cameraCount: db.prepare('SELECT COUNT(*) n FROM cameras WHERE cluster_id = ?').get(c.id).n,
});
adminRouter.get('/clusters', (_req, res) => {
    const rows = db.prepare('SELECT * FROM clusters ORDER BY sort, name').all();
    res.json(rows.map(clusterOut));
});
/**
 * Menghasilkan hash (verifikasi) DAN ciphertext (untuk ditampilkan ke admin).
 * - Kode baru diberikan      -> hash + enkripsi baru.
 * - Edit tanpa kode baru     -> hash & ciphertext lama dipertahankan.
 * - Pindah ke publik         -> keduanya dikosongkan.
 */
function resolveCode(mode, code, old) {
    if (mode === 'public')
        return { hash: null, enc: null };
    if (code)
        return { hash: hashCode(code), enc: encryptCode(code) };
    if (old.access_hash)
        return { hash: old.access_hash, enc: old.access_code_enc };
    return { error: 'Kode akses wajib diisi untuk akses terproteksi' };
}
adminRouter.post('/clusters', (req, res) => {
    const p = clusterBody.safeParse(req.body);
    if (!p.success)
        return res.status(400).json({ error: p.error.issues[0].message });
    const h = resolveCode(p.data.accessMode, p.data.accessCode, { access_hash: null, access_code_enc: null });
    if ('error' in h)
        return res.status(400).json({ error: h.error });
    if (db.prepare('SELECT 1 FROM clusters WHERE slug = ?').get(p.data.slug)) {
        return res.status(409).json({ error: 'Slug sudah dipakai' });
    }
    const id = newId();
    db.prepare('INSERT INTO clusters(id,slug,name,description,access_mode,access_hash,access_code_enc,sort) VALUES(?,?,?,?,?,?,?,?)').run(id, p.data.slug, p.data.name, p.data.description, p.data.accessMode, h.hash, h.enc, p.data.sort);
    res.status(201).json(clusterOut(db.prepare('SELECT * FROM clusters WHERE id = ?').get(id)));
});
adminRouter.put('/clusters/:id', (req, res) => {
    const old = db.prepare('SELECT * FROM clusters WHERE id = ?').get(req.params.id);
    if (!old)
        return res.status(404).json({ error: 'Cluster tidak ditemukan' });
    const p = clusterBody.safeParse(req.body);
    if (!p.success)
        return res.status(400).json({ error: p.error.issues[0].message });
    const h = resolveCode(p.data.accessMode, p.data.accessCode, old);
    if ('error' in h)
        return res.status(400).json({ error: h.error });
    const dup = db.prepare('SELECT id FROM clusters WHERE slug = ? AND id != ?').get(p.data.slug, old.id);
    if (dup)
        return res.status(409).json({ error: 'Slug sudah dipakai' });
    db.prepare('UPDATE clusters SET slug=?,name=?,description=?,access_mode=?,access_hash=?,access_code_enc=?,sort=? WHERE id=?').run(p.data.slug, p.data.name, p.data.description, p.data.accessMode, h.hash, h.enc, p.data.sort, old.id);
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
// ---------- Kode akses: lihat & cabut ----------
/**
 * Mencabut akses = menaikkan access_version. Semua grant (termasuk tautan embed
 * dan `?grant=` yang sudah dibagikan) langsung tidak berlaku, tanpa menunggu
 * masa berlaku token habis.
 *
 * `rotate` sekaligus mengganti kode. Ini penting: tanpa mengganti kode, orang
 * yang memegang kode lama bisa langsung unlock lagi dan mendapat grant baru.
 */
function revokeAccess(table, id, body) {
    const row = db.prepare(`SELECT * FROM ${table} WHERE id = ?`).get(id);
    if (!row)
        return { status: 404, body: { error: table === 'clusters' ? 'Cluster tidak ditemukan' : 'Kamera tidak ditemukan' } };
    if (row.access_mode !== 'protected') {
        return { status: 400, body: { error: 'Sumber ini publik, tidak ada kode akses untuk dicabut' } };
    }
    let code;
    let hash = row.access_hash;
    let enc = null;
    if (body.rotate) {
        code = body.accessCode?.trim() || generateCode();
        if (code.length < 4)
            return { status: 400, body: { error: 'Kode baru minimal 4 karakter' } };
        hash = hashCode(code);
        enc = encryptCode(code);
    }
    db.prepare(`UPDATE ${table} SET access_version = access_version + 1, access_hash = ?, access_code_enc = ? WHERE id = ?`)
        .run(hash, enc, id);
    const after = db.prepare(`SELECT access_version FROM ${table} WHERE id = ?`).get(id);
    return { status: 200, body: { id, accessVersion: after.access_version, rotated: !!body.rotate, code } };
}
const revokeBody = z.object({ rotate: z.boolean().optional(), accessCode: z.string().max(200).optional() });
adminRouter.get('/clusters/:id/code', (req, res) => {
    const row = db.prepare('SELECT * FROM clusters WHERE id = ?').get(req.params.id);
    if (!row)
        return res.status(404).json({ error: 'Cluster tidak ditemukan' });
    const code = decryptCode(row.access_code_enc);
    if (!code) {
        return res.status(409).json({
            error: 'Kode ini dibuat sebelum fitur "lihat kode" ada, jadi hanya tersimpan sebagai hash. Ganti kode untuk bisa melihatnya lagi.',
        });
    }
    res.json({ code });
});
adminRouter.post('/clusters/:id/revoke', (req, res) => {
    const p = revokeBody.safeParse(req.body ?? {});
    if (!p.success)
        return res.status(400).json({ error: p.error.issues[0].message });
    const r = revokeAccess('clusters', req.params.id, p.data);
    res.status(r.status).json(r.body);
});
adminRouter.get('/cameras/:id/code', (req, res) => {
    const row = db.prepare('SELECT * FROM cameras WHERE id = ?').get(req.params.id);
    if (!row)
        return res.status(404).json({ error: 'Kamera tidak ditemukan' });
    const code = decryptCode(row.access_code_enc);
    if (!code) {
        return res.status(409).json({
            error: 'Kode ini dibuat sebelum fitur "lihat kode" ada, jadi hanya tersimpan sebagai hash. Ganti kode untuk bisa melihatnya lagi.',
        });
    }
    res.json({ code });
});
adminRouter.post('/cameras/:id/revoke', (req, res) => {
    const p = revokeBody.safeParse(req.body ?? {});
    if (!p.success)
        return res.status(400).json({ error: p.error.issues[0].message });
    const r = revokeAccess('cameras', req.params.id, p.data);
    res.status(r.status).json(r.body);
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
    // Koordinat opsional untuk peta. null = belum ditentukan (jangan digambar di 0,0).
    lat: z.number().min(-90).max(90).nullable().default(null),
    lng: z.number().min(-180).max(180).nullable().default(null),
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
    codeViewable: !!c.access_code_enc && !!c.access_hash,
    accessVersion: c.access_version ?? 1,
    lat: c.lat ?? null, lng: c.lng ?? null,
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
    const h = resolveCode(d.accessMode, d.accessCode, { access_hash: null, access_code_enc: null });
    if ('error' in h)
        return res.status(400).json({ error: h.error });
    const id = newId();
    db.prepare(`INSERT INTO cameras(id,name,description,location,cluster_id,source_type,source_url,proxy,transcode,access_mode,access_hash,access_code_enc,listed,enabled,sort,lat,lng)
     VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`).run(id, d.name, d.description, d.location, d.clusterId, d.sourceType, d.sourceUrl, +d.proxy, +d.transcode, d.accessMode, h.hash, h.enc, +d.listed, +d.enabled, d.sort, d.lat, d.lng);
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
    const h = resolveCode(d.accessMode, d.accessCode, old);
    if ('error' in h)
        return res.status(400).json({ error: h.error });
    db.prepare(`UPDATE cameras SET name=?,description=?,location=?,cluster_id=?,source_type=?,source_url=?,proxy=?,transcode=?,
       access_mode=?,access_hash=?,access_code_enc=?,listed=?,enabled=?,sort=?,lat=?,lng=? WHERE id=?`).run(d.name, d.description, d.location, d.clusterId, d.sourceType, d.sourceUrl, +d.proxy, +d.transcode, d.accessMode, h.hash, h.enc, +d.listed, +d.enabled, d.sort, d.lat, d.lng, old.id);
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
