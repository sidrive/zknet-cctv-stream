import Database from 'better-sqlite3'
import fs from 'node:fs'
import path from 'node:path'
import crypto from 'node:crypto'
import { config } from './config.js'

fs.mkdirSync(config.dataDir, { recursive: true })
export const db = new Database(path.join(config.dataDir, 'cctv.db'))
db.pragma('journal_mode = WAL')
db.pragma('foreign_keys = ON')

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
`)

export const newId = () => crypto.randomBytes(8).toString('base64url')

// Migrasi ringan: kolom baru ditambahkan hanya jika belum ada, jadi aman dijalankan
// berulang pada database yang sudah berisi kamera.
function ensureColumn(table: string, column: string, type: string) {
  const cols = (db.prepare(`PRAGMA table_info(${table})`).all() as { name: string }[]).map((c) => c.name)
  if (!cols.includes(column)) db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${type}`)
}
// Koordinat peta. NULL = belum ditentukan; jangan digambar di (0,0).
ensureColumn('cameras', 'lat', 'REAL')
ensureColumn('cameras', 'lng', 'REAL')
// Pencabutan akses: grant lama ditolak bila versinya di bawah nilai ini.
ensureColumn('clusters', 'access_version', 'INTEGER NOT NULL DEFAULT 1')
ensureColumn('cameras', 'access_version', 'INTEGER NOT NULL DEFAULT 1')
// Kode akses terenkripsi (AES-256-GCM) supaya admin bisa membacanya lagi untuk dibagikan.
// access_hash tetap dipakai untuk verifikasi, jadi database bocor tanpa kunci env tidak
// langsung membuka semua kode.
ensureColumn('clusters', 'access_code_enc', 'TEXT')
ensureColumn('cameras', 'access_code_enc', 'TEXT')

const DEFAULTS: Record<string, string> = {
  site_title: 'ZKNet CCTV',
  site_description: 'Pantau kamera CCTV secara langsung.',
  // Daftar origin yang boleh meng-embed (dipisah baris/koma). Kosong = semua origin boleh.
  embed_origins: '',
  grant_ttl_hours: '12',
}

export function getSetting(key: string): string {
  const row = db.prepare('SELECT value FROM settings WHERE key = ?').get(key) as { value: string } | undefined
  return row?.value ?? DEFAULTS[key] ?? ''
}

export function setSetting(key: string, value: string) {
  db.prepare(
    'INSERT INTO settings(key,value) VALUES(?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value',
  ).run(key, value)
}

// Kunci enkripsi kode akses. Dibuat sekali per instalasi (seperti jwt_secret) supaya
// kode bisa ditampilkan lagi ke admin, tetapi tidak tersimpan sebagai teks biasa.
export function codeEncKey(): Buffer {
  let raw = getSetting('code_enc_key')
  if (!raw) {
    raw = crypto.randomBytes(32).toString('base64')
    setSetting('code_enc_key', raw)
  }
  return Buffer.from(raw, 'base64')
}

export const PUBLIC_SETTING_KEYS = ['site_title', 'site_description'] as const
export const EDITABLE_SETTING_KEYS = ['site_title', 'site_description', 'embed_origins', 'grant_ttl_hours'] as const

// Secret JWT: dari env, atau dibuat sekali lalu disimpan agar sesi bertahan setelah restart.
function resolveSecret(): string {
  if (config.jwtSecret) return config.jwtSecret
  let s = getSetting('jwt_secret')
  if (!s) {
    s = crypto.randomBytes(48).toString('base64url')
    setSetting('jwt_secret', s)
  }
  return s
}
export const jwtSecret = resolveSecret()

export function embedApiKey(): string {
  let k = getSetting('embed_api_key')
  if (!k) {
    k = 'zk_' + crypto.randomBytes(24).toString('base64url')
    setSetting('embed_api_key', k)
  }
  return k
}
