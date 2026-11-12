import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import crypto from 'node:crypto';
import { z } from 'zod';
import { canWatch, checkCode, cameraOpen, clusterOpen, getCamera, getCluster, grantsFromRequest, signGrant, parseGrant, emptyGrants, } from './access.js';
import { adminFromRequest } from './auth.js';
import { db, embedApiKey, getSetting, PUBLIC_SETTING_KEYS } from './db.js';
import { signStreamToken } from './streams.js';
export const publicRouter = Router();
const unlockLimiter = rateLimit({
    windowMs: 60_000,
    limit: 10,
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: 'Terlalu banyak percobaan. Coba lagi sebentar.' },
});
publicRouter.get('/health', (_req, res) => res.json({ ok: true }));
// Katalog yang aman ditampilkan: tanpa URL sumber & tanpa hash kode.
publicRouter.get('/catalog', (req, res) => {
    const g = adminFromRequest(req) ? null : grantsFromRequest(req);
    const clusters = db.prepare('SELECT * FROM clusters ORDER BY sort, name').all();
    const cameras = db
        .prepare('SELECT * FROM cameras WHERE enabled = 1 ORDER BY sort, name')
        .all();
    const byCluster = new Map(clusters.map((c) => [c.id, c]));
    const open = (c) => (g === null ? true : clusterOpen(c, g));
    const outClusters = clusters.map((c) => ({
        id: c.id,
        slug: c.slug,
        name: c.name,
        description: c.description,
        locked: c.access_mode === 'protected',
        unlocked: open(c),
        cameraCount: cameras.filter((x) => x.cluster_id === c.id && x.listed).length,
    }));
    const outCameras = cameras
        .filter((cam) => cam.listed && open(cam.cluster_id ? byCluster.get(cam.cluster_id) : undefined))
        .map((cam) => ({
        id: cam.id,
        name: cam.name,
        description: cam.description,
        location: cam.location,
        clusterId: cam.cluster_id,
        type: cam.source_type,
        locked: cam.access_mode === 'protected',
        unlocked: g === null ? true : cameraOpen(cam, g),
    }));
    const site = Object.fromEntries(PUBLIC_SETTING_KEYS.map((k) => [k, getSetting(k)]));
    res.json({ site, clusters: outClusters, cameras: outCameras });
});
// Detail satu kamera (untuk link langsung / embed, termasuk kamera yang tidak "listed").
publicRouter.get('/cameras/:id', (req, res) => {
    const cam = getCamera(req.params.id);
    if (!cam || !cam.enabled)
        return res.status(404).json({ error: 'Kamera tidak ditemukan' });
    const g = adminFromRequest(req) ? null : grantsFromRequest(req);
    const cluster = cam.cluster_id ? getCluster(cam.cluster_id) : undefined;
    res.json({
        id: cam.id,
        name: cam.name,
        description: cam.description,
        location: cam.location,
        type: cam.source_type,
        cluster: cluster
            ? { id: cluster.id, slug: cluster.slug, name: cluster.name, locked: cluster.access_mode === 'protected', unlocked: g === null ? true : clusterOpen(cluster, g) }
            : null,
        locked: cam.access_mode === 'protected',
        unlocked: g === null ? true : cameraOpen(cam, g),
    });
});
const unlockBody = z.object({
    kind: z.enum(['cluster', 'camera']),
    id: z.string().min(1).max(100),
    code: z.string().min(1).max(200),
    grant: z.string().optional(),
});
publicRouter.post('/unlock', unlockLimiter, (req, res) => {
    const p = unlockBody.safeParse(req.body);
    if (!p.success)
        return res.status(400).json({ error: 'Input tidak valid' });
    const { kind, id, code, grant } = p.data;
    const target = kind === 'cluster' ? getCluster(id) : getCamera(id);
    const hash = target?.access_hash ?? null;
    // Bandingkan selalu agar waktu respons tidak membocorkan keberadaan resource.
    const ok = checkCode(code, hash ?? '$2a$10$invalidinvalidinvalidinvalidinvalidinvalidinvalidinvalidinv') &&
        !!target && target.access_mode === 'protected';
    if (!ok || !target)
        return res.status(403).json({ error: 'Kode salah' });
    const g = parseGrant(grant);
    if (kind === 'cluster')
        g.clusters.add(target.id);
    else
        g.cameras.add(target.id);
    res.json({ grant: signGrant(g) });
});
// Minta sesi tonton: server memvalidasi akses lalu memberi token stream.
publicRouter.post('/cameras/:id/session', (req, res) => {
    const cam = getCamera(req.params.id);
    if (!cam || !cam.enabled)
        return res.status(404).json({ error: 'Kamera tidak ditemukan' });
    const isAdmin = !!adminFromRequest(req);
    if (!isAdmin) {
        const r = canWatch(cam, grantsFromRequest(req));
        if (!r.ok)
            return res.status(403).json({ error: 'Perlu kode akses', need: r.need });
    }
    const cluster = cam.cluster_id ? getCluster(cam.cluster_id) : undefined;
    const fullyPublic = cam.access_mode === 'public' && (!cluster || cluster.access_mode === 'public');
    switch (cam.source_type) {
        case 'hls': {
            // Tanpa proxy hanya untuk kamera yang benar-benar publik; selain itu URL sumber disembunyikan.
            if (!cam.proxy && fullyPublic)
                return res.json({ type: 'hls', url: cam.source_url });
            return res.json({ type: 'hls', url: `/stream/${signStreamToken(cam.id)}/index.m3u8` });
        }
        case 'rtsp':
            return res.json({ type: 'hls', url: `/stream/${signStreamToken(cam.id)}/index.m3u8` });
        case 'mjpeg':
            return res.json({ type: 'mjpeg', url: `/stream/${signStreamToken(cam.id)}/mjpeg` });
        case 'embed':
            // iframe pihak ketiga: URL tidak bisa disembunyikan. Disarankan hanya untuk sumber publik.
            return res.json({ type: 'embed', url: cam.source_url });
    }
});
// Dipanggil dari BACKEND aplikasi host (server-to-server) untuk menerbitkan grant
// sehingga user aplikasi host bisa menonton tanpa mengetik kode (SSO ke mini-app).
const grantBody = z.object({
    clusters: z.array(z.string()).default([]),
    cameras: z.array(z.string()).default([]),
    ttlMinutes: z.number().int().min(1).max(60 * 24).default(60),
});
publicRouter.post('/embed/grant', (req, res) => {
    const key = req.header('x-api-key') ?? '';
    const real = embedApiKey();
    const a = Buffer.from(key), b = Buffer.from(real);
    if (a.length !== b.length || !crypto.timingSafeEqual(a, b))
        return res.status(401).json({ error: 'API key salah' });
    const p = grantBody.safeParse(req.body);
    if (!p.success)
        return res.status(400).json({ error: 'Input tidak valid' });
    const g = emptyGrants();
    for (const c of p.data.clusters) {
        const row = getCluster(c);
        if (!row)
            return res.status(404).json({ error: `Cluster tidak ditemukan: ${c}` });
        g.clusters.add(row.id);
    }
    for (const c of p.data.cameras) {
        const row = getCamera(c);
        if (!row)
            return res.status(404).json({ error: `Kamera tidak ditemukan: ${c}` });
        g.cameras.add(row.id);
    }
    res.json({ grant: signGrant(g, p.data.ttlMinutes * 60) });
});
