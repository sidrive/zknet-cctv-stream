# ZKNet CCTV Stream

Hub streaming CCTV: **landing page publik**, **panel admin**, akses **gratis atau berkode**, pengelompokan **cluster** (juga bisa gratis/berkode), dan bisa **disematkan sebagai mini-app** di aplikasi lain.

> **Aplikasi ini hanya menyalurkan stream — tidak merekam.** Database hanya menyimpan *konfigurasi* (kamera, cluster, admin). Segmen video sementara dari ffmpeg (hanya untuk sumber RTSP) berupa buffer bergulir beberapa detik yang terhapus otomatis.

## Fitur

| Area | Detail |
|---|---|
| Landing page | Daftar cluster & kamera umum, pencarian, halaman cluster (daftar / *mode dinding* 2×2–4×4 dengan paginasi), halaman tonton per kamera |
| Mode dinding | Pilihan grid & halaman tersimpan di URL (`/c/<slug>?wall=3x3&page=2`) sehingga bisa di-refresh atau dibagikan; hanya halaman aktif yang memuat stream |
| Akses | Per **kamera** dan per **cluster**: `Gratis` atau `Perlu kode`. Kode disimpan terenkripsi + hash bcrypt, bisa dicabut seketika (lihat *Kode akses* di bawah), percobaan dibatasi (rate limit) |
| Sumber | **HLS** (.m3u8), **RTSP/RTMP/SRT** (diubah ke HLS oleh ffmpeg *hanya saat ada penonton*), **MJPEG**, **Embed** iframe (mis. YouTube Live) |
| Keamanan sumber | URL & kredensial kamera **tidak dikirim ke browser**: server menjadi proxy bertanda tangan (anti-SSRF). Kamera tak terdaftar & kamera di cluster terkunci disembunyikan dari katalog |
| Admin | Setup admin pertama lewat UI, login, CRUD kamera & cluster, uji tonton, pengaturan situs, ganti password |
| Urutan tampil | Kolom **Urutan** di form kamera & cluster (angka kecil lebih dulu, sama = urut nama) plus tombol **↑ / ↓** di daftar kamera untuk menggeser satu langkah — satu permintaan `POST /api/admin/cameras/reorder` menulis seluruh urutan dalam satu transaksi |
| Beberapa admin | Tab **Admin**: tambah akun, lihat kapan dibuat & terakhir login, reset password, **keluarkan sesi**, hapus akun. Tiap akun punya `token_version`, jadi menghapus akun atau mengeluarkan sesinya berlaku seketika (tidak menunggu cookie 12 jam) |
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

## Deploy ke STB Armbian (PM2 + Cloudflare Tunnel)

### Peta: API key CARTO

Halaman `/peta` memakai tile CARTO. Sejak 25 September 2026 raster tanpa key tidak lagi
dilayani, jadi **key wajib ada saat build**.

```bash
cp web/.env.example web/.env.production   # lalu isi VITE_CARTO_API_KEY
npm run build                             # key ditanam ke web/dist
```

Key ini **tanpa batasan domain** (pilihan sadar), supaya peta tetap tampil dari dua jalur:

| Akses | Keterangan |
|---|---|
| `https://cctv.domain.com` | lewat Cloudflare Tunnel — publik |
| `http://<ip-zerotier>:<port>` | lewat ZeroTier — internal |

Kalau key dibatasi ke domain saja, CARTO membalas **403** untuk jalur ZeroTier dan peta
menjadi kosong. Catatan: "Allowed IPs" di dashboard CARTO tidak menolong untuk ZeroTier —
yang dinilai adalah IP publik pengunjung, sedangkan IP ZeroTier (`10.147.x.x`) privat dan
tidak pernah terlihat oleh CARTO.

Konsekuensi yang diterima: key tertanam di `web/dist` yang di-commit, jadi ikut terlihat di
repo publik. Kuota gratis 1 juta permintaan/bulan per key dan bisa dipantau di dashboard
CARTO. Bila key disalahgunakan, buat key baru lalu build ulang.

Pola sama dengan app STB lain (`omni-invest-dashboard`, `landingpage-zknet-frontend`): build di luar STB, `dist/` di-commit, STB hanya `git pull`; Node dijaga PM2; domain lewat Cloudflare Tunnel yang sudah ada. Express melayani web + API + stream sekaligus, jadi **tidak perlu container nginx**.

### 1. Rilis (laptop/sandbox)
```bash
npm run release     # = deploy/release.sh: npm ci -> test -> build -> commit server/dist + web/dist -> push
```

### 2. Setup pertama di STB
```bash
sudo apt install -y ffmpeg            # Node >= 20.6 dan pm2 juga dibutuhkan (npm i -g pm2)
git clone -b main https://github.com/sidrive/zknet-cctv-stream.git ~/zknet-cctv-stream   # lokasi bebas
cd ~/zknet-cctv-stream

ss -tulpn | grep LISTEN               # pilih port yang benar-benar kosong
cp .env.example .env && nano .env
```
Isi minimal `.env`:
```ini
PORT=<port kosong>
DATA_DIR=/var/lib/zknet-cctv
STREAM_TMP_DIR=/dev/shm/zknet-cctv    # segmen HLS di RAM, bukan di flash
COOKIE_SECURE=true
TRUST_PROXY=true
SETUP_TOKEN=<acak panjang>
FFMPEG_IDLE_SECONDS=30
```

> Lokasi repo di STB bebas (mis. `/opt/zknet-cctv-stream` atau `/home/sidrive/zknet-cctv-stream`).
> Skrip di `deploy/` mendeteksi folder induknya sendiri, jadi tidak perlu mengubah path
> apa pun — cukup jalankan dari lokasi mana pun repo berada.

### 3. Pindahkan database yang sudah ada (semua kamera, cluster, admin, pengaturan)
Di mesin tempat database diisi (`./data/cctv.db` atau `$DATA_DIR`):
```bash
npm run db:export -- ./cctv-export.db        # snapshot konsisten, aman walau server sedang jalan
scp cctv-export.db <user>@<ip-stb>:/tmp/
```
Di STB:
```bash
./deploy/stb-restore-db.sh /tmp/cctv-export.db   # dijalankan dari root repo
```
Skrip memvalidasi file (integrity check + jumlah admin/cluster/kamera), menghentikan app, membuat backup `cctv.db.bak-<waktu>` bila sudah ada DB, membersihkan sisa WAL, memasang file (`chmod 600`), lalu menyalakan app. Login admin lama tetap berlaku (secret sesi ikut tersalin). `SETUP_TOKEN` tidak dipakai lagi karena admin sudah ada.

> File database berisi **URL & kredensial kamera** dan hash kode akses. Perlakukan seperti rahasia: transfer lewat `scp`/SSH, hapus `cctv-export.db` dari `/tmp` setelah restore.

### 4. Jalankan
```bash
./deploy/stb-update.sh   # npm ci (hanya dependency server) + pm2 start + pm2 save + cek /api/health (dari root repo)
pm2 startup                                   # sekali saja, agar hidup lagi setelah reboot (ikuti perintah yang ditampilkan)
```

### 5. Cloudflare Tunnel
Di `/etc/cloudflared/config.yml`, **sebelum** catch-all `http_status:404`:
```yaml
  - hostname: cctv.domainanda.com
    service: http://localhost:<PORT>
```
```bash
cloudflared tunnel route dns <tunnel-id> cctv.domainanda.com
systemctl restart cloudflared
curl https://cctv.domainanda.com/api/health
```
Setelah itu, di panel admin → *Embed & Pengaturan*, isi "Origin yang boleh meng-embed" bila dipakai sebagai mini-app.

### Update berikutnya
Laptop: `npm run release`. STB: dari root repo, jalankan `./deploy/stb-update.sh`.

### Kode akses: berbagi, melihat lagi, dan mencabut
Kode akses cluster/kamera disimpan **terenkripsi** (AES-256-GCM), sehingga admin bisa
membukanya lagi untuk dibagikan. Verifikasi tetap memakai hash bcrypt, jadi file database
yang bocor sendirian tidak langsung membuka semua kode.

Di panel admin, form cluster/kamera yang berstatus *Perlu kode* menampilkan:

* **kode saat ini** + tombol **Salin** — untuk dibagikan ulang;
* **Cabut + ganti kode** — kode baru dibuat server (bisa juga Anda ketik sendiri), lalu
  ditampilkan sekali untuk disalin;
* **Cabut akses saja** — mematikan semua tautan/grant yang sudah beredar tanpa mengganti kode.

**Apa yang dicabut?** Setiap kali kode dipakai, server menerbitkan token (grant) berisi daftar
ID yang dibuka dan versi aksesnya. Mencabut akses menaikkan `access_version`, sehingga token
lama langsung ditolak — tidak perlu menunggu masa berlaku habis (bawaan 12 jam, lihat
`grant_ttl_hours`). Yang ikut terputus: tautan `?grant=…`, embed yang memakai API key, dan
tab browser yang sedang menonton.

> **Penting:** "Cabut akses saja" tidak mengubah kode, jadi orang yang tahu kode lama masih bisa
> membuka lagi. Bila kode benar-benar bocor, pakai **Cabut + ganti kode**.

Kode yang dibuat **sebelum** fitur ini ada hanya tersimpan sebagai hash, sehingga tidak bisa
ditampilkan. Panel akan memberi tahu; cukup ganti kode sekali agar bisa dilihat lagi.

### Mengisi koordinat kamera (sekali, setelah update yang menambahkan /peta)
Migrasi aplikasi hanya **menambah kolom** `lat`/`lng` yang masih kosong, jadi `/peta` akan
menampilkan "0 kamera berkoordinat" sampai kolom itu diisi. Isinya tidak perlu internet —
`scripts/camera-coords.json` ikut repo.

```bash
./deploy/stb-apply-coords.sh   # jalankan dari root repo
```

Skrip itu: membaca `DATA_DIR` dari `.env`, **membuat backup** `cctv.db.pre-coords-<waktu>.bak`,
menampilkan pratinjau (dry-run), lalu menulis koordinat. Aman diulang — koordinat yang sudah
ada tidak ditimpa, jadi koreksi manual lewat panel admin tetap utuh.

Bila ada kamera yang tidak dikenali sumbernya (mis. namanya Anda ubah), skrip menampilkannya
di daftar "Tanpa koordinat di sumber". Isi manual: *Admin → Kamera → Edit → Latitude/Longitude*
(atau tombol **Pilih dari peta…**). Kamera tanpa koordinat tidak digambar di `/peta`, bukan
ditaruh di 0,0.

Untuk menimpa semua koordinat dari sumber: `deploy/stb-apply-coords.sh --force`.

### Catatan khusus STB (S905x)
* **Jangan centang "Transcode"** pada kamera RTSP: encoding H.264 di CPU STB sangat berat. Kamera H.265 butuh transcode, jadi pakai sumber H.264 (substream) bila ada.
* Upload ISP = batas jumlah penonton bersamaan (1 penonton ≈ 1× bitrate stream).
* MJPEG adalah koneksi panjang dan bisa diputus oleh timeout proxy Cloudflare; HLS lebih aman lewat tunnel.
* Cek kebijakan Cloudflare untuk traffic video di plan Anda sebelum dibuka ke publik luas.
* `pm2 logs zknet-cctv` untuk log; `pm2 monit` untuk CPU/RAM.

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
