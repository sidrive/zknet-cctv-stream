# Pipeline Bedah Mockup → Prompt Implementasi

Alur kerja: **ChatGPT (generate mockup PNG/JPG) → bedah otomatis → prompt → Claude/AI lain (implementasi)**.

## Instalasi (sekali)

```bash
cd ~/Zakanet/zknet-cctv-stream
python3 -m venv .venv-mock
.venv-mock/bin/pip install pillow numpy scipy
```

## Pemakaian

```bash
# 1. Taruh mockup
mkdir -p mockups && cp ~/Downloads/mockup-app.png mockups/

# 2. Bedah → spek.json + assets/ + laporan.md
.venv-mock/bin/python scripts/bedah_mockup.py mockups/mockup-app.png --out bedah

# 3. Buat prompt untuk AI implementasi
.venv-mock/bin/python scripts/buat_prompt.py bedah/spek.json --stack react-tailwind

#    stack tersedia: react-tailwind | next-tailwind | flutter | react-native | html-css
```

Hasil:

```
bedah/
  spek.json      data lengkap (palet, blok+koordinat CSS, grid, radius, aset)
  laporan.md     tabel ringkas untuk dibaca manusia
  prompt.md      prompt siap-tempel ke Claude/AI lain
  assets/        crop ikon & media terpisah (PNG RGBA)
```

## Apa yang diekstrak otomatis

| Aspek | Metode | Akurasi |
|---|---|---|
| Ukuran kanvas CSS | tebak device pixel ratio dari lebar | tinggi (bisa `--scale` manual) |
| Palet warna | kuantisasi + hitung frekuensi | tinggi |
| Posisi & ukuran blok | segmentasi per-warna + connected components | sedang–tinggi |
| Radius sudut | telusur diagonal dari sudut blok | sedang |
| Skala spacing | uji kelipatan 4/5/6/8/10/12/16 | sedang |
| Aset ikon/gambar | crop per blok + filter fragmen kosong | sedang, perlu review |
| Skala mockup | `--scale 2` bila perlu paksa | manual |

## Yang TIDAK bisa diekstrak (harus manual / AI vision)

Ini penting untuk ekspektasi realistis soal "90% mirip":

- **Nama font** — pakai WhatTheFont / Fontjoy, atau tanya Claude dengan `look_at_image`.
- **font-weight, line-height, letter-spacing** — tidak terbaca dari segmentasi warna.
- **Shadow, gradient, blur, opacity** — hilang saat kuantisasi warna.
- **State interaktif** — hover/pressed/disabled tidak ada di gambar statis.
- **Hierarki semantik** — mana heading, mana body, mana label (hanya ditebak dari ukuran).
- **Perilaku responsif & animasi**.

## Tips menaikkan kemiripan

1. **Minta ChatGPT generate mockup @2x atau @3x** (mis. 768px atau 1170px lebar untuk mobile).
   Mockup 1x terlalu kecil, ikon jadi buram.
2. **Minta mockup dengan background rata** (bukan gradient/vignette) — segmentasi jauh lebih akurat.
3. **Hindari JPEG**; minta **PNG**. JPEG menambah noise yang memecah blok jadi fragmen.
4. Jalankan `--scale` manual bila tebakan otomatis salah.
5. Setelah implementasi, bandingkan hasil vs mockup dengan screenshot overlay (PixelPerfect /
   Chrome DevTools) — bukan dengan mata.
6. Ikon generik jangan diekstrak: cari padanan di **lucide.dev** / **iconify.design**.

## Batasan jujur

- Ini **bukan** konversi pixel-perfect. Realistis: 60–75% struktur otomatis,
  sisanya iterasi manual dengan AI.
- Deteksi blok berbasis warna warna **gagal pada desain penuh gradient/foto**.
  Untuk kasus itu, andalkan AI vision + pengukuran manual.
- Fragmen kecil hasil crop perlu **direview satu-satu**; sebagian hanya noise.
