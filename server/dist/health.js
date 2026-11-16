/**
 * Probe kesehatan sumber kamera (online/offline/unknown).
 *
 * Tujuan: agar UI tidak berbohong. Sebelum ini, badge "LIVE" selalu tampil dan
 * statistik "Online" hanyalah jumlah kamera yang tidak berkode.
 *
 * Aturan penting:
 * - Probe berjalan di latar belakang, BUKAN di jalur render katalog. Response
 *   /api/catalog tetap cepat.
 * - Hasil di-cache (default 60 detik) supaya 150 kamera tidak dipukul terus.
 * - Dibatasi beberapa permintaan paralel sekaligus agar STB tidak kewalahan.
 * - Tidak mengikuti redirect dan tidak membaca body: hanya memastikan sumber
 *   menjawab (status < 400). Segmen video tidak diunduh.
 */
import { config } from './config.js';
import { db } from './db.js';
const UNKNOWN = { status: 'unknown', checkedAt: null, latencyMs: null };
const cache = new Map();
let running = null;
let lastFullRun = null;
/** Kamera jenis embed (iframe YouTube dll) tidak bisa di-probe dari server: mungkin diblokir CORS/hosting. */
const probeable = (cam) => cam.source_type !== 'embed';
export function getProbe(camId) {
    return cache.get(camId) ?? UNKNOWN;
}
export function getAllProbes() {
    return Object.fromEntries(cache);
}
export function lastCheckAt() {
    return lastFullRun;
}
async function probeOne(cam) {
    const started = Date.now();
    try {
        const ac = new AbortController();
        const timer = setTimeout(() => ac.abort(), config.probeTimeoutMs);
        // HEAD lebih murah; sebagian server streaming menolak HEAD, jadi GET + langsung batal.
        const res = await fetch(cam.source_url, {
            method: 'GET',
            redirect: 'manual',
            signal: ac.signal,
            headers: { accept: '*/*' },
        });
        clearTimeout(timer);
        // "masih terhubung" sudah cukup: baca beberapa byte lalu putuskan.
        await res.body?.cancel().catch(() => undefined);
        const ok = res.status < 400;
        return { status: ok ? 'online' : 'offline', checkedAt: Date.now(), latencyMs: Date.now() - started };
    }
    catch {
        return { status: 'offline', checkedAt: Date.now(), latencyMs: Date.now() - started };
    }
}
/**
 * Perbarui cache untuk kamera yang sudah kedaluwarsa. Mengembalikan Promise yang
 * sama bila pemindaian masih berjalan, jadi pemanggilan berulang aman.
 */
export function refreshProbes(force = false) {
    if (running)
        return running;
    const rows = db.prepare('SELECT * FROM cameras WHERE enabled = 1').all();
    const now = Date.now();
    const stale = rows.filter((c) => probeable(c) && (force || now - (cache.get(c.id)?.checkedAt ?? 0) >= config.probeCacheSeconds * 1000));
    if (stale.length === 0) {
        return Promise.resolve();
    }
    running = (async () => {
        const queue = [...stale];
        const worker = async () => {
            for (let cam = queue.shift(); cam; cam = queue.shift()) {
                cache.set(cam.id, await probeOne(cam));
            }
        };
        await Promise.all(Array.from({ length: Math.min(config.probeConcurrency, queue.length) }, worker));
        lastFullRun = Date.now();
    })().finally(() => {
        running = null;
    });
    return running;
}
/** Untuk pengujian: kosongkan cache. */
export function resetProbes() {
    cache.clear();
    lastFullRun = null;
}
