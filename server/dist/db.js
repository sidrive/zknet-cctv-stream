import Database from 'better-sqlite3';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { config } from './config.js';
fs.mkdirSync(config.dataDir, { recursive: true });
export const db = new Database(path.join(config.dataDir, 'cctv.db'));
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');
// Catatan: database hanya menyimpan KONFIGURASI (kamera, cluster, admin).
// Tidak ada video/rekaman yang disimpan.
db.exec(`
CREATE TABLE IF NOT EXISTS admins (
  id TEXT PRIMARY KEY,
  username TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS clusters (
  id TEXT PRIMARY KEY,
  slug TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  access_mode TEXT NOT NULL DEFAULT 'public' CHECK (access_mode IN ('public','protected')),
  access_hash TEXT,
  sort INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS cameras (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  location TEXT NOT NULL DEFAULT '',
  cluster_id TEXT REFERENCES clusters(id) ON DELETE SET NULL,
  source_type TEXT NOT NULL CHECK (source_type IN ('hls','mjpeg','rtsp','embed')),
  source_url TEXT NOT NULL,
  proxy INTEGER NOT NULL DEFAULT 1,
  transcode INTEGER NOT NULL DEFAULT 0,
  access_mode TEXT NOT NULL DEFAULT 'public' CHECK (access_mode IN ('public','protected')),
  access_hash TEXT,
  listed INTEGER NOT NULL DEFAULT 1,
  enabled INTEGER NOT NULL DEFAULT 1,
  sort INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_cameras_cluster ON cameras(cluster_id);
`);
export const newId = () => crypto.randomBytes(8).toString('base64url');
const DEFAULTS = {
    site_title: 'ZKNet CCTV',
    site_description: 'Pantau kamera CCTV secara langsung.',
    // Daftar origin yang boleh meng-embed (dipisah baris/koma). Kosong = semua origin boleh.
    embed_origins: '',
    grant_ttl_hours: '12',
};
export function getSetting(key) {
    const row = db.prepare('SELECT value FROM settings WHERE key = ?').get(key);
    return row?.value ?? DEFAULTS[key] ?? '';
}
export function setSetting(key, value) {
    db.prepare('INSERT INTO settings(key,value) VALUES(?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value').run(key, value);
}
export const PUBLIC_SETTING_KEYS = ['site_title', 'site_description'];
export const EDITABLE_SETTING_KEYS = ['site_title', 'site_description', 'embed_origins', 'grant_ttl_hours'];
// Secret JWT: dari env, atau dibuat sekali lalu disimpan agar sesi bertahan setelah restart.
function resolveSecret() {
    if (config.jwtSecret)
        return config.jwtSecret;
    let s = getSetting('jwt_secret');
    if (!s) {
        s = crypto.randomBytes(48).toString('base64url');
        setSetting('jwt_secret', s);
    }
    return s;
}
export const jwtSecret = resolveSecret();
export function embedApiKey() {
    let k = getSetting('embed_api_key');
    if (!k) {
        k = 'zk_' + crypto.randomBytes(24).toString('base64url');
        setSetting('embed_api_key', k);
    }
    return k;
}
