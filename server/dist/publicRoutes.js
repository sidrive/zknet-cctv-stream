import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import crypto from 'node:crypto';
import fs from 'node:fs';
import { z } from 'zod';
import { canWatch, checkCode, cameraOpen, clusterOpen, getCamera, getCluster, grantsFromRequest, signGrant, parseGrant, emptyGrants, } from './access.js';
import { adminFromRequest } from './auth.js';
import { config } from './config.js';
import { db, embedApiKey, getSetting, PUBLIC_SETTING_KEYS } from './db.js';
import { ffmpeg } from './ffmpeg.js';
import { getAllProbes, lastCheckAt, refreshProbes } from './health.js';
import { signStreamToken } from './streams.js';
export const publicRouter = Router();
const startedAt = Date.now();
const unlockLimiter = rateLimit({
    windowMs: 60_000,
    limit: config.unlockRateLimit,
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: 'Terlalu banyak percobaan. Coba lagi sebentar.' },
});
/**
 * Versi & waktu build ikut dikirim supaya kasus "panel bilang endpoint tidak ditemukan"
 * bisa langsung didiagnosis: biasanya proses yang berjalan masih build lama
 * (git pull sudah, PM2 belum restart). Bandingkan `buildAt` dengan commit terakhir.
 */
const BUILD_AT = (() => {
    // dist (produksi) memakai .js; tes menjalankan sumber .ts lewat tsx.
    for (const f of ['./publicRoutes.js', './publicRoutes.ts']) {
        try {
            return fs.statSync(new URL(f, import.meta.url)).mtime.toISOString();
        }
        catch { /* coba berikutnya */ }
    }
    return null;
})();
const VERSION = (() => {
    try {
        const pkg = JSON.parse(fs.readFileSync(new URL('../package.json', import.meta.url), 'utf8'));
        return pkg.version ?? null;
    }
    catch {
        return null;
    }
})();
publicRouter.get('/health', (_req, res) => res.json({
    ok: true,
    version: VERSION,
    buildAt: BUILD_AT,
    startedAt: new Date(startedAt).toISOString(),
    uptimeSec: Math.round((Date.now() - startedAt) / 1000),
}));
/**
 * Ringkasan kesehatan sistem untuk kartu "Layanan ZKNet" dan halaman Status Jaringan.
 * Angka online/offline berasal dari probe latar belakang (lihat health.ts); bila belum
 * pernah diprobe, statusnya "unknown" — jangan ditampilkan sebagai hijau.
 */
publicRouter.get('/health/detail', (req, res) => {
    // Visibilitas SAMA dengan katalog: kamera tak terdaftar (listed=0) dan kamera di cluster yang
    // belum dibuka tidak boleh muncul (nama maupun ID), sebab ID itulah pelindung "hanya via link".
    // Kamera berkode di cluster terbuka tetap tampil (sengaja, sebagai pemikat).
    const g = adminFromRequest(req) ? null : grantsFromRequest(req);
    const clusters = new Map(db.prepare('SELECT * FROM clusters').all().map((c) => [c.id, c]));
    const rows = db
        .prepare('SELECT id, name, cluster_id, source_type, enabled, listed FROM cameras WHERE enabled = 1')
        .all()
        .filter((cam) => g === null || (cam.listed && clusterOpen(cam.cluster_id ? clusters.get(cam.cluster_id) : undefined, g)));
    const probes = getAllProbes();
    const counts = { online: 0, offline: 0, unknown: 0 };
    for (const cam of rows)
        counts[probes[cam.id]?.status ?? 'unknown']++;
    const problems = rows
        .filter((cam) => probes[cam.id]?.status === 'offline')
        .map((cam) => ({ id: cam.id, name: cam.name, checkedAt: probes[cam.id].checkedAt }));
    res.json({
        ok: counts.offline === 0 || counts.online > 0,
        uptimeSeconds: Math.floor((Date.now() - startedAt) / 1000),
        cameras: { total: rows.length, enabled: rows.length, ...counts },
        clusters: clusters.size,
        transcoders: ffmpeg.activeCount(),
        lastCheckAt: lastCheckAt(),
        problems,
    });
});
/**
 * Picu probe segera (tombol "Cek ulang" di halaman Status). Endpoint ini publik, jadi dibatasi:
 * paling sering sekali per `probeRefreshCooldownSeconds` (global), dan respons tidak menunggu
 * lebih dari 10 detik (probe tetap berjalan di latar belakang) agar tidak kena timeout proxy.
 * Tanpa batas ini siapa pun bisa memaksa STB memukul semua sumber kamera terus-menerus.
 */
let lastForcedRefresh = 0;
publicRouter.post('/health/refresh', async (_req, res) => {
    const now = Date.now();
    const throttled = now - lastForcedRefresh < config.probeRefreshCooldownSeconds * 1000;
    if (!throttled) {
        lastForcedRefresh = now;
        await Promise.race([refreshProbes(true), new Promise((r) => setTimeout(r, 10_000))]);
    }
    res.json({ ok: true, throttled, lastCheckAt: lastCheckAt() });
});
// Katalog yang aman ditampilkan: tanpa URL sumber & tanpa hash kode.
publicRouter.get('/catalog', (req, res) => {
    const g = adminFromRequest(req) ? null : grantsFromRequest(req);
    const clusters = db.prepare('SELECT * FROM clusters ORDER BY sort, name').all();
    const cameras = db
        .prepare('SELECT * FROM cameras WHERE enabled = 1 ORDER BY sort, name')
        .all();
    const byCluster = new Map(clusters.map((c) => [c.id, c]));
    const open = (c) => (g === null ? true : clusterOpen(c, g));
    const probes = getAllProbes();
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
        status: probes[cam.id]?.status ?? 'unknown',
        // Opsi C: koordinat hanya untuk kamera yang memang boleh dilihat. Kamera berkode
        // tidak pernah mengirim lat/lng supaya lokasinya tidak bocor lewat "view source".
        ...(g === null || (clusterOpen(cam.cluster_id ? byCluster.get(cam.cluster_id) : undefined, g) && cameraOpen(cam, g))
            ? { lat: cam.lat, lng: cam.lng }
            : {}),
    }));
    const site = Object.fromEntries(PUBLIC_SETTING_KEYS.map((k) => [k, getSetting(k)]));
    res.json({ site, clusters: outClusters, cameras: outCameras, lastCheckAt: lastCheckAt() });
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
        status: getAllProbes()[cam.id]?.status ?? 'unknown',
        cluster: cluster
            ? { id: cluster.id, slug: cluster.slug, name: cluster.name, locked: cluster.access_mode === 'protected', unlocked: g === null ? true : clusterOpen(cluster, g) }
            : null,
        locked: cam.access_mode === 'protected',
        unlocked: g === null ? true : cameraOpen(cam, g),
        ...(g === null || (clusterOpen(cluster, g) && cameraOpen(cam, g)) ? { lat: cam.lat, lng: cam.lng } : {}),
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
    // Simpan versi akses saat ini: kalau admin mencabut akses, grant ini mati.
    if (kind === 'cluster')
        g.clusters.set(target.id, target.access_version ?? 1);
    else
        g.cameras.set(target.id, target.access_version ?? 1);
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
        g.clusters.set(row.id, row.access_version ?? 1);
    }
    for (const c of p.data.cameras) {
        const row = getCamera(c);
        if (!row)
            return res.status(404).json({ error: `Kamera tidak ditemukan: ${c}` });
        g.cameras.set(row.id, row.access_version ?? 1);
    }
    res.json({ grant: signGrant(g, p.data.ttlMinutes * 60) });
});
