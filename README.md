# ZKNet CCTV Stream

Hub streaming CCTV: **landing page publik**, **panel admin**, akses **gratis atau berkode**, pengelompokan **cluster** (juga bisa gratis/berkode), dan bisa **disematkan sebagai mini-app** di aplikasi lain.

> **Aplikasi ini hanya menyalurkan stream — tidak merekam.** Database hanya menyimpan *konfigurasi* (kamera, cluster, admin). Segmen video sementara dari ffmpeg (hanya untuk sumber RTSP) berupa buffer bergulir beberapa detik yang terhapus otomatis.

## Fitur

| Area | Detail |
|---|---|
| Landing page | Daftar cluster & kamera umum, pencarian, halaman cluster (daftar / *mode dinding* multi-kamera), halaman tonton per kamera |
| Akses | Per **kamera** dan per **cluster**: `Gratis` atau `Perlu kode`. Kode di-hash (bcrypt), percobaan dibatasi (rate limit) |
| Sumber | **HLS** (.m3u8), **RTSP/RTMP/SRT** (diubah ke HLS oleh ffmpeg *hanya saat ada penonton*), **MJPEG**, **Embed** iframe (mis. YouTube Live) |
| Keamanan sumber | URL & kredensial kamera **tidak dikirim ke browser**: server menjadi proxy bertanda tangan (anti-SSRF). Kamera tak terdaftar & kamera di cluster terkunci disembunyikan dari katalog |
| Admin | Setup admin pertama lewat UI, login, CRUD kamera & cluster, uji tonton, pengaturan situs, ganti password |
| Mini-app | `embed.js` / iframe `/embed`, pembatasan origin (CSP `frame-ancestors`), **SSO grant** dari backend aplikasi host |

## Aturan akses

* Kamera bisa ditonton jika **cluster-nya terbuka** (gratis atau kodenya sudah dimasukkan) **dan** **kameranya terbuka** (gratis atau kodenya sudah dimasukkan).
* Kode cluster membuka *daftar* kameranya; kamera yang punya kode sendiri tetap meminta kodenya.
* Setelah kode benar, browser menerima *grant* (JWT, default berlaku 12 jam) yang disimpan di `localStorage` dan digabung bila membuka beberapa kunci.
* Admin yang login dapat menonton semua kamera (untuk uji).

## Menjalankan

### Pengembangan
```bash
npm install
cp .env.example .env     # opsional
npm run dev:server       # API di :8080
npm run dev:web          # UI di :5173 (proxy ke :8080)
```
Buka `http://localhost:5173/admin` → **Setup admin pertama**.

### Produksi (tanpa Docker)
Butuh Node 20+ dan `ffmpeg` di PATH (hanya untuk sumber RTSP).
```bash
npm ci && npm run build
PORT=8080 DATA_DIR=./data npm start
```

### Docker
```bash
SETUP_TOKEN=token-rahasia docker compose up -d --build
```
Data persisten di volume `cctv-data`. Pasang di belakang reverse proxy HTTPS lalu set `COOKIE_SECURE=true` dan `TRUST_PROXY=true`.

> **Penting saat dipasang di internet:** isi `SETUP_TOKEN` sebelum pertama kali dijalankan agar orang lain tidak bisa membuat admin pertama mendahului Anda.

## Menambah kamera

| Tipe | URL contoh | Catatan |
|---|---|---|
| HLS | `https://host/stream/index.m3u8` | Default lewat proxy (URL tersembunyi). Matikan proxy hanya untuk kamera publik agar hemat bandwidth |
| RTSP | `rtsp://user:pass@192.168.1.10:554/stream1` | ffmpeg start saat ada penonton, berhenti setelah idle. Kamera H.265 → centang *Transcode* |
| MJPEG | `http://192.168.1.10/video.mjpg` | Selalu lewat proxy |
| Embed | `https://www.youtube.com/embed/ID` | URL **terlihat penonton** — cocok hanya untuk sumber publik |

Server yang menarik stream harus bisa menjangkau kamera (LAN/VPN). Browser penonton **tidak** perlu.

## Memasang sebagai mini-app di aplikasi lain

```html
<script src="https://cctv.contoh.com/embed.js"
        data-cluster="slug-cluster"   <!-- atau data-camera="ID" -->
        data-height="480"></script>
```
atau manual:
```js
ZKNetCCTV.mount(document.getElementById('cctv'), { cluster: 'lobby', height: 480 })
```
Contoh halaman host: `/demo-host.html`.

* **Batasi origin**: Panel admin → *Embed & Pengaturan* → "Origin yang boleh meng-embed". Kosong = semua origin boleh.
* **Event ke host** (`postMessage`): `zknet-cctv:ready`, `zknet-cctv:resize {height}`, `zknet-cctv:camera {id,name}`.
* **SSO**: agar user aplikasi host tidak mengetik kode, **backend** host meminta grant (API key ada di panel admin; jangan taruh di frontend):
  ```bash
  curl -X POST https://cctv.contoh.com/api/embed/grant \
    -H "x-api-key: zk_..." -H "content-type: application/json" \
    -d '{"clusters":["lobby"],"cameras":[],"ttlMinutes":60}'
  # → {"grant":"eyJ..."}  lalu: <script ... data-grant="eyJ..."></script>
  ```

## API ringkas

| Method | Path | Keterangan |
|---|---|---|
| GET | `/api/catalog` | Cluster & kamera yang boleh dilihat (header `x-grant` opsional) |
| POST | `/api/unlock` | `{kind:'cluster'\|'camera', id, code, grant?}` → `{grant}` |
| POST | `/api/cameras/:id/session` | Validasi akses → `{type,url}` untuk pemutar |
| POST | `/api/embed/grant` | Server-to-server, header `x-api-key` |
| `*` | `/api/admin/...` | Panel admin (cookie `httpOnly`, `SameSite=Strict`) |

## Tes

```bash
npm test                                                  # unit + e2e API (HLS proxy, akses, grant)
MEDIAMTX_BIN=/path/mediamtx npm test                      # + RTSP → HLS sungguhan (butuh ffmpeg & MediaMTX)
```

## Catatan keamanan & batasan

* Admin hanya satu tipe peran (administrator); belum ada multi-admin/role.
* Satu kode per kamera/cluster (dibagikan ke banyak orang). Mencabut akses = ganti kode; grant yang sudah terbit tetap berlaku sampai kedaluwarsa (atur di Pengaturan).
* Admin dipercaya menentukan URL sumber; server akan menarik URL tersebut. Jangan beri akses admin ke pihak yang tidak dipercaya.
* Rate limit bersifat in-memory (per proses) — gunakan satu instance, atau tambahkan store bersama bila di-scale.
* Konsumsi bandwidth server = jumlah penonton × bitrate untuk sumber yang diproxy.
