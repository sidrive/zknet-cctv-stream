#!/usr/bin/env python3
"""
buat_prompt.py — Ubah spek.json (hasil bedah_mockup.py) menjadi prompt siap-tempel
untuk Claude / AI lain, agar implementasi UI mendekati mockup.

Pakai:
  python buat_prompt.py bedah/spek.json --stack react-tailwind --out bedah/prompt.md
  python buat_prompt.py bedah/spek.json --stack flutter
  python buat_prompt.py bedah/spek.json --stack react-tailwind --part layout
"""
import argparse
import json

STACKS = {
    'react-tailwind': {
        'name': 'React + TypeScript + Tailwind CSS',
        'notes': [
            'Gunakan komponen fungsional + TypeScript interface untuk props.',
            'Pakai Tailwind utility; nilai px dari tabel di bawah ubah ke arbitrary value bila tidak ada di skala, mis. `w-[184px]`.',
            'Pisahkan komponen: satu file per blok besar, di folder `components/`.',
            'Ikon: gunakan pustaka lucide-react bila ikon generik; hanya vektorisasi aset kustom.',
        ],
    },
    'next-tailwind': {
        'name': 'Next.js App Router + TypeScript + Tailwind CSS',
        'notes': [
            'Server Component default; beri `"use client"` hanya pada bagian interaktif.',
            'Pakai `next/image` untuk semua media.',
            'Tailwind utility dengan arbitrary value untuk ukuran px presisi.',
        ],
    },
    'flutter': {
        'name': 'Flutter (Dart)',
        'notes': [
            'Konversi px CSS ke logical pixel langsung (1:1).',
            'Gunakan `Container` + `BoxDecoration(borderRadius: BorderRadius.circular(N))` sesuai radius.',
            'Warna jadi `Color(0xFFRRGGBB)`.',
            'Spasi: `SizedBox(height: N)` atau `EdgeInsets.all(N)`.',
        ],
    },
    'react-native': {
        'name': 'React Native + TypeScript',
        'notes': [
            'Gunakan `StyleSheet.create`.',
            'Warna jadi string hex langsung. Radius via `borderRadius`.',
            'Gunakan `expo-image` untuk media.',
        ],
    },
    'html-css': {
        'name': 'HTML + CSS murni',
        'notes': [
            'Gunakan CSS custom properties untuk palet di `:root`.',
            'Grid/Flexbox untuk layout; hindari absolute positioning kecuali overlay.',
        ],
    },
}


def px_scale(scale):
    return f'1 px CSS = {scale} px gambar (mockup disimpan @{scale}x)'


def build(spek, stack_key, part):
    st = STACKS[stack_key]
    W = spek['raw_size']['w']; H = spek['raw_size']['h']
    cs = spek['scale']['css_size']; sc = spek['scale']['value']
    pal = spek['palette']; grid = spek['grid']; blocks = spek['blocks']; assets = spek['assets']

    L = []
    L.append(f"# Prompt Implementasi UI — target: {st['name']}\n")
    L.append("> Tempel seluruh isi ini ke Claude/AI lain bersama file mockup dan folder `assets/`.\n")

    L.append("## Konteks\n")
    L.append(f"Saya punya mockup UI berukuran **{W}×{H}px** yang dibuat pada **@{sc}x**.")
    L.append(f"Kanvas CSS sebenarnya: **{cs['w']}×{cs['h']} px** ({px_scale(sc)}).")
    L.append(f"Semua angka pada tabel di bawah **sudah dalam px CSS** — jangan dikali/dibagi lagi.\n")

    L.append("## Palet Warna (gunakan persis)\n")
    L.append("| Hex | Porsi di mockup | Peran yang disarankan |")
    L.append("|---|---|---|")
    for p in pal[:12]:
        L.append(f"| `{p['hex']}` | {p['pct']}% | {p['role']} |")
    L.append("")
    L.append("Petakan ke token desain: warna dengan porsi terbesar & paling terang = `background`;")
    L.append("gelap dengan porsi besar = `text-primary` atau `surface-dark`; sisanya `border`, `muted`, `accent`.\n")

    L.append(f"## Skala Spacing\n")
    L.append(f"Grid terdeteksi **{grid['scale']}px** (keyakinan {grid['confidence']}%).")
    L.append(f"Gunakan kelipatan {grid['scale']}px untuk semua padding/margin/gap. "
             f"Jangan pakai angka acak di luar skala ini.\n")

    roles = {}
    for b in blocks:
        roles.setdefault(b['role'], 0)
        roles[b['role']] += 1
    L.append("## Struktur Blok\n")
    L.append("Ringkasan peran: " + ", ".join(f"**{k}**×{v}" for k, v in
             sorted(roles.items(), key=lambda x: -x[1])) + "\n")

    L.append("### Detail blok (urutan atas → bawah, kiri → kanan)\n")
    L.append("| # | Peran | left | top | width | height | radius | warna |")
    L.append("|---|---|---|---|---|---|---|---|")
    for i, b in enumerate(blocks, 1):
        c = b['css']
        L.append(f"| {i} | {b['role']} | {c['left']} | {c['top']} | {c['width']} | {c['height']} | {c['radius']} | `{b['color']}` |")
    L.append("")

    L.append(f"## Aset Gambar ({len(assets)})\n")
    if assets:
        L.append("File tersedia di folder `assets/`:\n")
        L.append("| File | Peran | Ukuran asli | Tindakan yang diminta |")
        L.append("|---|---|---|---|")
        for a in assets:
            act = ('**vektorisasi ke SVG** (ikon raster → vector), lalu pakai sebagai komponen ikon'
                   if a['svg_recommended'] else 'pakai sebagai gambar; cari sumber resolusi lebih tinggi bila pecah')
            L.append(f"| `{a['file']}` | {a['role']} | {a['w']}×{a['h']} | {act} |")
    else:
        L.append("_Tidak ada aset terpisah yang terekstrak; semua elemen dibuat dengan CSS/ikon pustaka._")
    L.append("")

    L.append("## Instruksi Implementasi\n")
    for i, n in enumerate(st['notes'], 1):
        L.append(f"{i}. {n}")

    L.append("")
    L.append("### Aturan presisi (WAJIB)\n")
    L.append("1. **Jangan mengarang ukuran.** Ambil `left/top/width/height/radius` dari tabel blok.")
    L.append("2. **Jangan mengganti palet.** Semua warna harus dari tabel palet; bila butuh turunan,")
    L.append("   pakai `opacity` atau `color-mix`, bukan hex baru.")
    L.append("3. **Radius** sudah terukur per blok — pakai nilai itu, jangan default 8px untuk semua.")
    L.append("4. Susun dengan **flex/grid**, bukan absolute positioning, kecuali elemen overlay (badge, FAB).")
    L.append("5. Untuk setiap blok, buat **satu komponen** dengan nama sesuai perannya.")
    L.append("6. Setelah selesai, tampilkan **peta blok → komponen** agar bisa saya audit.\n")

    L.append("## Kriteria Selesai\n")
    L.append("- Semua blok di tabel punya komponen dengan ukuran & radius sesuai.")
    L.append("- Palet & grid dipatuhi tanpa pengecualian.")
    L.append("- Semua aset di `assets/` terpakai atau punya padanan yang dijelaskan.")
    L.append("- Tampilan responsif: blok besar jadi `w-full`, ukuran kecil tetap px.\n")

    L.append("## Yang TIDAK diketahui dari mockup (harus Anda putuskan/tanyakan)\n")
    L.append("- Nama font asli (perlu identifikasi terpisah, mis. WhatTheFont).")
    L.append("- Line-height, letter-spacing, font-weight per teks.")
    L.append("- State interaktif (hover/pressed/disabled) — tidak terlihat di gambar statis.")
    L.append("- Shadow, gradient, dan blur (tidak terukur dari segmentasi warna).")
    L.append("- Perilaku responsif & animasi.")

    if part == 'layout':
        # hanya bagian layout
        keep = L[:L.index("## Aset Gambar ({})".format(len(assets))) if False else len(L)]
    return '\n'.join(L) + '\n'


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('spek')
    ap.add_argument('--stack', default='react-tailwind', choices=sorted(STACKS))
    ap.add_argument('--out', default=None)
    ap.add_argument('--part', default='all', choices=['all', 'layout'])
    args = ap.parse_args()

    spek = json.load(open(args.spek, encoding='utf-8'))
    txt = build(spek, args.stack, args.part)
    out = args.out or args.spek.rsplit('/', 1)[0] + '/prompt.md'
    open(out, 'w', encoding='utf-8').write(txt)
    print(txt[:1400])
    print(f"\n...\n\nTersimpan ke: {out}  ({len(txt)} karakter)")


if __name__ == '__main__':
    main()
