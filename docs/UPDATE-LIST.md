# Daftar Update Aplikasi — ZKNet CCTV Stream

Hasil audit menu/tombol yang **ada di UI tapi belum berfungsi** (atau berfungsi tapi menampilkan data yang salah).
Setiap item menyebut lokasi kode supaya bisa langsung dikerjakan.

Audit dilakukan pada commit `57fbe38` dengan server dijalankan lokal (`data/cctv.db`: 2 cluster, 150 kamera, 149 HLS + 1 RTSP).

**Progres:** #1 peta, #2 halaman status, #3 statistik online, #10 badge status, #11 health detail selesai
(Sprint 1 + peta). #4, #5, #6, #7, #14 selesai (Sprint 2). #12, #8, #9, dan #13 selesai. Sisa: #15.

## Ringkasan

| # | Menu / elemen | Kondisi sekarang | Prioritas |
|---|---|---|---|
| 1 | **Peta Lokasi** (sidebar) | membuka bagian daftar kamera, tidak ada peta | P0 |
| 2 | **Status Jaringan** (sidebar) | statis "Normal", tidak ada data | P0 |
| 3 | **Statistik "Online"** | angka = jumlah kamera tidak berkode, bukan kamera yang hidup | P0 |
| 4 | ~~**Notifikasi** (ikon lonceng)~~ | **selesai** — panel berisi kamera offline nyata + `lastCheckAt`; titik merah hanya bila ada kamera bermasalah | ✅ |
| 5 | ~~**Avatar / menu pengguna**~~ | **selesai** — sekarang tautan ke `/admin` berlabel "Masuk admin" | ✅ |
| 6 | ~~**"Lihat Semua →"** pada Daftar Cluster~~ | **selesai** — halaman `/cluster` dengan pencarian + saringan Gratis/Berkode | ✅ |
| 7 | ~~**Pintasan ⌘ K** pada kolom cari~~ | **selesai** — ⌘K/Ctrl+K memfokuskan kolom, Escape mengosongkan | ✅ |
| 8 | ~~**Mode Dinding** di halaman cluster~~ | **selesai** — grid 2×2/3×3/4×4 + paginasi, tersimpan di URL (`?wall=3x3&page=2`), hanya halaman aktif yang memuat stream | ✅ |
| 9 | ~~**Manajemen admin** di panel admin~~ | **selesai** — tab Admin: tambah akun, daftar (dibuat & login terakhir), reset password, keluarkan sesi, hapus; tiap akun punya `token_version` sehingga pencabutan langsung berlaku | ✅ |
| 10 | **Status per kamera (online/offline)** | selalu tampil "LIVE"/"Online", tidak pernah cek sumber | P1 |
| 11 | **Log/riwayat & health detail** | `/api/health` hanya `{ok:true}` | P2 |
| 12 | ~~**Manajemen kode akses**~~ | **selesai** — `access_version` + kode terenkripsi: kode bisa dilihat lagi, cabut akses seketika (dengan/tanpa ganti kode) | ✅ |
| 13 | ~~**Urutan (sort) di UI admin**~~ | **selesai** — input "Urutan" di form kamera & cluster, tombol ↑/↓ di daftar kamera (endpoint `POST /api/admin/cameras/reorder` menulis seluruh urutan dalam satu transaksi) | ✅ |
| 14 | ~~**Halaman 404 SPA**~~ | **selesai** — URL tak dikenal balas 404 (aset & rute SPA tetap 200) + halaman 404 dengan tombol kembali | ✅ |
| 15 | **Navigasi publik tidak konsisten** | sidebar hanya di Beranda, halaman lain pakai gaya lama | P2 |

---

## P0 — Menu yang terlihat bisa diklik tapi tidak melakukan apa-apa

### 1. Peta Lokasi
- **Lokasi:** `web/src/pages/Home.tsx:56` — `<a href="#cctv-publik">Peta Lokasi</a>`
- **Masalah:** mengarah ke panel daftar kamera. Tidak ada peta, tidak ada koordinat kamera.
- **Yang dibutuhkan:**
  - Kolom `lat`, `lng` pada tabel `cameras` (`server/src/db.ts`) + validasi di `cameraBody` (`server/src/adminRoutes.ts`).
  - Input koordinat di `CameraForm` (bisa sekalian "ambil dari lokasi saat ini" / tempel link Google Maps).
  - Halaman `/peta` baru: marker Leaflet (OpenStreetMap, tanpa API key) + klik marker → buka `/v/:id`.
  - API: `GET /api/catalog` cukup ditambah field `lat`/`lng` (tidak membocorkan URL sumber).
- **Catatan:** kamera yang belum punya koordinat jangan ditampilkan sebagai marker di (0,0).

### 2. Status Jaringan
- **Lokasi:** `web/src/pages/Home.tsx:57` (link) dan `Home.tsx:105` (kartu "Layanan ZKNet — Normal")
- **Masalah:** teks "Normal" hardcoded. Endpoint `/api/status`, `/api/network/status` tidak ada (404).
- **Yang dibutuhkan:**
  - `GET /api/health/detail`: uptime, jumlah kamera enabled/total, jumlah transcoder aktif (`ffmpeg.activeCount()` sudah tersedia), versi, waktu cek terakhir.
  - Opsional: probe ringan tiap kamera (HEAD ke URL sumber, timeout 3 s, cache 60 s) → hitung `online`/`offline` sungguhan.
  - UI: halaman `/status` berisi tabel kamera bermasalah + waktu cek terakhir; kartu di Beranda menampilkan hasil nyata (hijau/kuning/merah), bukan teks tetap.

### 3. Statistik "Online" salah arti
- **Lokasi:** `web/src/pages/Home.tsx:102`
- **Masalah:** `online = data.cameras.length - protectedCount` → "Online" sebenarnya "kamera gratis". Kamera berkode yang hidup dihitung mati, kamera gratis yang mati dihitung hidup.
- **Perbaikan:** pakai hasil probe dari item 2, atau (sementara, sebelum probe ada) ganti label menjadi "Gratis" & "Berkode" agar tidak menyesatkan.

---

## P1 — Kontrol ada tapi tidak berfungsi

### 4. Notifikasi (ikon lonceng)
- **Lokasi:** `web/src/pages/Home.tsx:86` — `<button aria-label="Notifikasi">` + `<span className="zk-dot">`
- **Masalah:** tidak ada `onClick`, tidak ada panel, tidak ada endpoint; titik merah selalu tampil (menyiratkan ada notifikasi padahal kosong).
- **Perbaikan:** dropdown notifikasi yang isinya dari data nyata — mis. "3 kamera offline" (dari item 2), "cluster baru ditambahkan". Titik merah hanya muncul bila ada item baru (simpan `last_seen` di `localStorage`). Kalau belum ada sumber data, hapus titik merahnya dulu.

### 5. Avatar / menu pengguna
- **Lokasi:** `web/src/pages/Home.tsx:87` — `<div className="zk-avatar">`
- **Masalah:** elemen dekoratif; pengunjung mengira ini tombol akun.
- **Perbaikan (pilih salah satu):**
  - Publik: ganti jadi tombol **"Masuk admin"** (`Link to="/admin"`).
  - Atau menu: Masuk admin, Pasang Internet ZKNet (WhatsApp), Bahasa.
- **Jangan** dibiarkan sebagai `<div>` yang tidak bisa diklik.

### 6. "Lihat Semua →" pada Daftar Cluster
- **Lokasi:** `web/src/pages/Home.tsx:112` — `<a className="zk-link" href="#">`
- **Masalah:** `href="#"` hanya melompat ke atas halaman.
- **Perbaikan:** buat halaman `/cluster` (daftar semua cluster, dengan pencarian & filter Gratis/Berkode), lalu link ke sana. Sembunyikan link bila jumlah cluster ≤ yang sudah tampil.

### 7. Pintasan ⌘ K
- **Lokasi:** `web/src/pages/Home.tsx:83` — `<span className="zk-kbd">⌘ K</span>`
- **Masalah:** hanya hiasan; menekan ⌘K / Ctrl+K tidak memfokuskan kolom cari.
- **Perbaikan:** `useEffect` global `keydown` → `cmd/ctrl+k` fokus ke input cari (dan `Escape` mengosongkan). Sembunyikan label ⌘K di layar sentuh.

### 8. Mode Dinding di halaman cluster
- **Lokasi:** `web/src/pages/ClusterPage.tsx:29` (`openCams.slice(0, 9)`) dan tombol `:38-39`
- **Masalah:** maksimal 9 kamera walau cluster punya 108; pilihan mode tidak tersimpan (hilang saat refresh / tombol back).
- **Perbaikan:** pilihan 2×2 / 3×3 / 4×4 (atau daftar "semua"), pagination untuk sisa kamera, dan simpan mode di URL (`?wall=3x3&page=2`). Pertimbangkan lazy-load agar 108 stream tidak dibuka sekaligus.

### 9. Manajemen admin di panel admin
- **Lokasi:** `web/src/pages/Admin.tsx` (`Settings` — hanya ganti password sendiri), `server/src/adminRoutes.ts` (tidak ada CRUD admin)
- **Masalah:** tidak ada cara menambah admin kedua, melihat daftar admin, atau menghapus admin.
- **Perbaikan:**
  - `GET/POST/DELETE /api/admin/users` (hash bcrypt, tolak hapus admin terakhir).
  - Tab "Admin" di panel; tampilkan `created_at` dan siapa yang login terakhir.
  - Bonus: tombol "keluar dari semua sesi" (rotasi `jwt_secret`).

### 10. Status per kamera (online/offline)
- **Lokasi:** `web/src/pages/Home.tsx:218` & `:244` (badge `LIVE` di `DashboardCameraCard`/`DashboardCameraRow`), `web/src/components/CameraTile.tsx:9-10` (ikon `▶` tanpa cek status)
- **Masalah:** badge "LIVE" muncul sebelum stream apa pun dimuat; kamera mati tetap terlihat "LIVE".
- **Perbaikan:** kirim `status` dari server (hasil probe item 2) di `/api/catalog`; badge jadi `LIVE` / `Offline` / `Berkode` / `Tak diketahui`. Di kartu Beranda cukup teks, jangan buka stream (hemat bandwidth).

---

## P2 — Peningkatan & kerapian

### 11. Log & health detail
- `/api/health` hanya `{ok:true}`. Tambahkan `uptime`, `version`, `cameras_enabled`, `transcoders`, `db_size`.
- Riwayat singkat: 20 kejadian terakhir (kamera offline/online, admin login gagal). Simpan di tabel `events` (ringkas, auto-prune 7 hari).

### 12. Manajemen kode akses
- Sekarang kode hanya bisa diganti, tidak dicabut. Grant yang sudah dibagikan tetap berlaku sampai `grant_ttl_hours`.
- Tambahkan tombol **"Cabut semua akses"** per cluster/kamera: simpan `access_version` di tabel, sertakan di grant, tolak grant dengan versi lama.

### 13. Urutan (sort) tidak bisa diatur dari UI
- `sort` dikirim `CameraForm`/`ClusterForm` tetapi tidak ada input; selalu 0.
- Tambahkan input angka atau drag-and-drop di tabel admin (`Admin.tsx`).

### 14. Halaman 404
- `server/src/index.ts` mengirim `index.html` untuk semua path → URL salah membalas 200 (buruk untuk SEO & monitoring).
- Kirim status 404 untuk path non-aset yang tidak dikenal, tetap tampilkan SPA `<Route path="*">` (sudah ada di `App.tsx`).

### 15. Konsistensi navigasi publik
- Sidebar + topbar baru (`zk-*`) hanya ada di `Home.tsx`. `ClusterPage`, `Watch`, dan `Embed` masih memakai `container page` lama.
- Ekstrak `AppShell` (sidebar + topbar + pencarian) dan pakai di semua halaman publik.
- Sidebar saat ini tidak menandai menu aktif (`is-active` hardcoded di Dashboard) — hitung dari `useLocation`.

---

## Temuan kecil (cepat, bisa digabung)

| Lokasi | Masalah |
|---|---|
| `Home.tsx:101-107` | 5 kartu statistik di layar kecil bisa meluber — perlu tes 360 px |
| `ClusterPage.tsx:38` | tombol "Mode dinding" hanya muncul bila >1 kamera terbuka |
| `Watch.tsx` | tidak ada tombol "kembali ke mode dinding" / navigasi kamera sebelumnya-berikutnya |
| `Admin.tsx` | tidak ada indikator "sedang menyimpan" pada form cluster |
| `server/src/index.ts` | CSP `frame-src http: https:` cukup longgar — pertimbangkan `frame-src 'self'` untuk halaman non-embed |

## Urutan pengerjaan yang disarankan

1. **Sprint 1 (kebenaran data):** #11 health detail + #3 statistik + #10 badge status → semua halaman jadi jujur soal kondisi kamera.
2. **Sprint 2 (menu mati):** #7 ⌘K, #6 halaman semua cluster, #4 notifikasi, #5 avatar, #14 404.
3. **Sprint 3 (fitur baru):** #1 peta (butuh migrasi DB), #2 halaman status, #8 mode dinding penuh.
4. **Sprint 4 (admin):** #9 manajemen admin, #12 cabut akses, #13 sort, #15 AppShell.

## Catatan teknis

- Migrasi DB: `docker/data` memakai `better-sqlite3` + DDL inline di `server/src/db.ts`. Tambahkan kolom baru dengan `ALTER TABLE ... ADD COLUMN` yang dibungkus pengecekan `PRAGMA table_info` agar aman dijalankan berulang pada database yang sudah berisi 150 kamera.
- Probe kamera harus di-cache dan dijalankan berurutan (batas 5 sekaligus) supaya tidak membebani 150 sumber sekaligus.
- Semua fitur baru wajib menambah kasus di `server/src/e2e.test.ts` (saat ini 7 lulus, 1 skip karena ffmpeg tidak tersedia).
