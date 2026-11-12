# ZKNet Design System

## Isi paket
- `zknet-ds.css`: token (`--zk-*`) + semua komponen (`.zk-*`)
- `design-system.html`: halaman referensi + contoh dashboard. Buka langsung di browser.

## Cara pakai
1. Salin `zknet-ds.css` ke project (mis. `src/styles/`) lalu import sekali di entry:
   ```js
   import "./zknet-ds.css";
   ```
2. Tambahkan class `zk` pada `<body>` (atau elemen root app).
3. Pakai class komponen. Contoh (React):
   ```tsx
   <div className="zk-stat zk-stat--success">
     <div className="zk-stat__icon"><svg className="zk-icon"><use href="#i-radio"/></svg></div>
     <div>
       <div className="zk-stat__label">Online</div>
       <div className="zk-stat__value">{onlineCount}</div>
     </div>
   </div>
   ```
4. Ubah tampilan grid kamera lewat satu variabel: `<div className="zk-grid-cams" style={{'--zk-cols': cols}}>`.

## Daftar komponen
| Class | Fungsi |
|---|---|
| `.zk-app`, `.zk-sidebar`, `.zk-main`, `.zk-topbar` | Kerangka halaman |
| `.zk-nav__item` (`.is-active`) | Menu sidebar |
| `.zk-search`, `.zk-icon-btn`, `.zk-avatar` | Topbar |
| `.zk-hero` (+ `--zk-hero-img`) | Banner utama |
| `.zk-chip` (`--blue`, `--green`) | Label pada hero |
| `.zk-badge` (`--online/offline/locked/info/live`) | Status |
| `.zk-btn` (`--primary/ghost/whatsapp/sm`) | Tombol |
| `.zk-stat` (`--primary/success/danger/violet/status`) | Kartu statistik |
| `.zk-panel`, `.zk-panel__head` | Panel |
| `.zk-list-item` / `.zk-cluster-item` | Baris cluster |
| `.zk-cam` (`--offline`), `.zk-grid-cams` | Tile kamera |
| `.zk-segmented`, `.zk-select` | Kontrol tampilan |
| `.zk-promo`, `.zk-promo-side` | Banner CTA |

## Aturan desain
- Radius naik seiring ukuran elemen: badge 8, tombol/chip 12, kartu 16, panel/hero 20.
- Warna status konsisten: hijau = online, merah = offline, amber = terkunci/berkode, biru = aksi utama, ungu = cluster.
- Elemen aktif (menu, tombol utama) memakai gradien biru + glow; elemen lain datar.
- Gambar kamera dan hero selalu diberi scrim gelap agar teks terbaca.
- Fokus keyboard terlihat (`--zk-focus-ring`), animasi dimatikan saat `prefers-reduced-motion`.
