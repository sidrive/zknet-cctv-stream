import crypto from 'node:crypto'
import { codeEncKey } from './db.js'

/**
 * Enkripsi kode akses supaya admin bisa melihatnya lagi untuk dibagikan.
 *
 * PERHATIAN (batas perlindungan): kunci enkripsi disimpan di tabel `settings` pada database
 * YANG SAMA. Jadi enkripsi ini hanya mencegah kode terbaca sekilas (mis. lewat `sqlite3` atau
 * log), BUKAN melindungi dari orang yang memegang salinan file database (backup, `scp`,
 * db:export): pemegang file itu bisa membaca kunci dan mendekripsi semua kode. Perlakukan file
 * database dan backup-nya sebagai rahasia. Perlindungan sungguhan butuh kunci di luar database
 * (mis. variabel environment), yang berarti kunci itu harus ikut dipindahkan saat pindah server.
 *
 * Kenapa tidak cukup hash: hash satu arah, sehingga kode lama tidak mungkin
 * ditampilkan kembali. Verifikasi tetap memakai hash (bcrypt, lihat access.ts),
 * kolom terenkripsi hanya untuk ditampilkan.
 *
 * Format: v1.<iv b64url>.<tag b64url>.<ciphertext b64url>
 */
const VERSION = 'v1'

export function encryptCode(plain: string): string {
  const iv = crypto.randomBytes(12)
  const cipher = crypto.createCipheriv('aes-256-gcm', codeEncKey(), iv)
  const ct = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()])
  const tag = cipher.getAuthTag()
  return [VERSION, iv.toString('base64url'), tag.toString('base64url'), ct.toString('base64url')].join('.')
}

/** Mengembalikan null bila data tidak ada, rusak, atau kunci enkripsi sudah berubah. */
export function decryptCode(enc: string | null | undefined): string | null {
  if (!enc) return null
  const parts = enc.split('.')
  if (parts.length !== 4 || parts[0] !== VERSION) return null
  try {
    const iv = Buffer.from(parts[1], 'base64url')
    const tag = Buffer.from(parts[2], 'base64url')
    const ct = Buffer.from(parts[3], 'base64url')
    const d = crypto.createDecipheriv('aes-256-gcm', codeEncKey(), iv)
    d.setAuthTag(tag)
    return Buffer.concat([d.update(ct), d.final()]).toString('utf8')
  } catch {
    return null
  }
}

/**
 * Kode acak yang mudah dibaca dan diketik ulang. Tanpa huruf/angka mirip
 * (0/O, 1/l/I) supaya tidak salah saat dibagikan lewat WhatsApp atau lisan.
 */
export function generateCode(len = 10): string {
  const alphabet = 'abcdefghjkmnpqrstuvwxyz23456789'
  const bytes = crypto.randomBytes(len)
  let out = ''
  for (let i = 0; i < len; i++) out += alphabet[bytes[i] % alphabet.length]
  return out
}
