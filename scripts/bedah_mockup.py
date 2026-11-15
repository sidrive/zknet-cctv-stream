#!/usr/bin/env python3
"""
bedah_mockup.py v3 — Bongkar mockup UI (PNG/JPG) jadi spesifikasi implementasi.

Pendekatan: segmentasi per-warna (flat UI = blok warna dominan), bukan diff background.
Ini tahan terhadap gradient/vignette hasil generate AI.

Output:
  spek.json          — data lengkap (palet, blok, grid, aset)
  assets/            — crop ikon & gambar terpisah
  laporan.md         — ringkasan siap-tempel ke AI lain

Pakai:
  python bedah_mockup.py mockup.png --out ./bedah [--scale 2]
"""
import argparse
import json
import os
from collections import Counter

import numpy as np
from PIL import Image
from scipy import ndimage


def hexc(c):
    return '#%02x%02x%02x' % tuple(int(x) for x in c[:3])


def lum(c):
    r, g, b = [x / 255.0 for x in c[:3]]
    return 0.2126 * r + 0.7152 * g + 0.0722 * b


def role(c):
    r, g, b = [int(x) for x in c[:3]]
    L, sat = lum(c), max(r, g, b) - min(r, g, b)
    if sat < 16:
        if L > 0.96: return 'bg-white'
        if L > 0.86: return 'surface-abu-terang'
        if L > 0.68: return 'border-divider'
        if L > 0.30: return 'text-muted'
        if L > 0.10: return 'text-primary'
        return 'near-black'
    if L < 0.28: return 'accent-dark'
    if L > 0.82: return 'accent-light'
    return 'accent'


# ---------- palet ----------
def palette(rgb, top=14):
    H, W = rgb.shape[:2]
    q = (rgb // 8 * 8).reshape(-1, 3)
    cnt = Counter(map(tuple, q))
    tot = H * W
    out = []
    for c, n in cnt.most_common(top):
        out.append({'hex': hexc(c), 'rgb': [int(v) for v in c],
                    'pct': round(100 * n / tot, 2), 'role': role(c)})
    return out


# ---------- blok ----------
def color_mask(rgb, color, tol=26):
    return (np.abs(rgb - np.array(color)).max(axis=2) <= tol)


def region_blocks(rgb, color, min_area, tol=26, max_pct=0.9):
    """Ambil blok solid berwarna tertentu."""
    H, W = rgb.shape[:2]
    m = color_mask(rgb, color, tol)
    m = ndimage.binary_closing(m, np.ones((3, 3)))
    m = ndimage.binary_opening(m, np.ones((3, 3)))
    lbl, n = ndimage.label(m)
    if n == 0:
        return []
    out = []
    for i, sl in enumerate(ndimage.find_objects(lbl), 1):
        if sl is None:
            continue
        ys, xs = sl
        w, h = xs.stop - xs.start, ys.stop - ys.start
        area = w * h
        if area < min_area or area > max_pct * W * H:
            continue
        fill = float(m[sl].mean())
        if fill < 0.45:      # bukan blok solid
            continue
        out.append({'x': int(xs.start), 'y': int(ys.start), 'w': int(w), 'h': int(h),
                    'color': hexc(color), 'fill': round(fill, 2),
                    'area_pct': round(100 * area / (W * H), 2)})
    return out


def radius_of(rgb, b, maxr=44):
    x0, y0, x1, y1 = b['x'], b['y'], b['x'] + b['w'], b['y'] + b['h']
    H, W = rgb.shape[:2]
    sub = rgb[y0:min(H, y0 + maxr), x0:min(W, x0 + maxr)].astype(int)
    if sub.size == 0:
        return 0
    corner = sub[0, 0]
    for d in range(1, min(sub.shape[0], sub.shape[1])):
        if np.abs(sub[d, d] - corner).sum() > 34:
            return int(d)
    return 0


def classify(b, rgb):
    w, h = b['w'], b['h']
    x0, y0 = b['x'], b['y']
    sub = rgb[y0:y0 + h, x0:x0 + w]
    std = float(sub.std()) if sub.size else 0
    ratio = max(w, h) / max(1, min(w, h))
    L = lum([int(c) for c in sub.reshape(-1, 3).mean(axis=0)]) if sub.size else 0.5
    if max(w, h) <= 56 and ratio <= 1.5:
        return 'ikon'
    if h <= 40 and w > h * 2:
        return 'teks/baris'
    if ratio <= 1.4 and 56 < max(w, h) <= 110:
        return 'tombol/ikon-besar'
    if w >= 140 and h >= 90 and std > 26:
        return 'gambar/media'
    if L < 0.3:
        return 'panel-gelap'
    return 'kartu/panel'


def snap(v, scale):
    return int(round(v / scale) * scale)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('image')
    ap.add_argument('--out', default='bedah')
    ap.add_argument('--scale', type=float, default=None)
    ap.add_argument('--tol', type=int, default=26)
    args = ap.parse_args()

    img = Image.open(args.image)
    rgb = np.asarray(img.convert('RGB')).astype(int)
    H, W = rgb.shape[:2]
    os.makedirs(args.out, exist_ok=True)
    os.makedirs(os.path.join(args.out, 'assets'), exist_ok=True)

    pal = palette(rgb)

    # skala
    if args.scale:
        scale, note = args.scale, 'manual'
    elif W >= 1080 and W % 3 == 0:
        scale, note = 3, f'auto ({W} habis dibagi 3)'
    elif W >= 700 and W % 2 == 0:
        scale, note = 2, f'auto ({W} habis dibagi 2)'
    else:
        scale, note = 1, 'auto (asumsi 1x)'

    # blok dari tiap warna dominan
    blocks = []
    min_area = max(240, (W * H) // 4000)
    for p in pal:
        c = p['rgb']
        for b in region_blocks(rgb, c, min_area, tol=args.tol):
            b['role'] = classify(b, rgb)
            b['radius_px'] = radius_of(rgb, b)
            blocks.append(b)

    # buang duplikat/nested yang hampir sama
    blocks.sort(key=lambda b: -b['w'] * b['h'])
    kept = []
    for b in blocks:
        dup = False
        for k in kept:
            ix = max(0, min(b['x'] + b['w'], k['x'] + k['w']) - max(b['x'], k['x']))
            iy = max(0, min(b['y'] + b['h'], k['y'] + k['h']) - max(b['y'], k['y']))
            inter = ix * iy
            if inter and inter / min(b['w'] * b['h'], k['w'] * k['h']) > 0.86:
                dup = True
                break
        if not dup:
            kept.append(b)
    blocks = sorted(kept, key=lambda b: (b['y'], b['x']))

    # grid
    vals = []
    for b in blocks:
        vals += [b['w'], b['h'], b['x'], b['y'], b['radius_px'] * 2]
    vals = [v for v in vals if 4 <= v <= 500]
    gbest = (8, 0.0)
    for s in (4, 5, 6, 8, 10, 12, 16, 20):
        if not vals:
            break
        ok = sum(1 for v in vals if min(v % s, s - v % s) <= max(1, s * 0.1))
        sc = ok / len(vals)
        if sc > gbest[1]:
            gbest = (s, sc)
    grid = {'scale': gbest[0], 'confidence': round(gbest[1] * 100, 1)}

    # pendinginan CSS (snap ke grid)
    for b in blocks:
        b['css'] = {
            'left': snap(b['x'], grid['scale']),
            'top': snap(b['y'], grid['scale']),
            'width': snap(b['w'], grid['scale']),
            'height': snap(b['h'], grid['scale']),
            'radius': snap(b['radius_px'], 2),
        }

    # aset
    assets = []
    for i, b in enumerate(blocks):
        if b['role'] not in ('ikon', 'tombol/ikon-besar', 'gambar/media'):
            continue
        x0, y0 = b['x'], b['y']
        crop = img.convert('RGBA').crop((x0, y0, x0 + b['w'], y0 + b['h']))
        ca = np.asarray(crop.convert('RGB')).astype(int)
        # buang fragmen kosong / noise JPEG (mis. potongan background rata)
        if ca.size == 0 or float(ca.std()) < 8 or len(np.unique(ca.reshape(-1, 3), axis=0)) < 16:
            continue
        pref = 'icon' if b['role'].startswith('ikon') or b['role'].startswith('tombol') else 'media'
        fn = f"{pref}_{i:03d}_{b['w']}x{b['h']}.png"
        crop.save(os.path.join(args.out, 'assets', fn))
        assets.append({'file': fn, 'role': b['role'], 'x': x0, 'y': y0,
                       'w': b['w'], 'h': b['h'],
                       'svg_recommended': pref == 'icon'})

    res = {
        'source': os.path.abspath(args.image),
        'raw_size': {'w': W, 'h': H},
        'scale': {'value': scale, 'note': note,
                  'css_size': {'w': round(W / scale), 'h': round(H / scale)}},
        'palette': pal,
        'grid': grid,
        'block_count': len(blocks),
        'blocks': blocks,
        'assets': assets,
        'asset_summary': dict(Counter(a['role'] for a in assets)),
    }
    with open(os.path.join(args.out, 'spek.json'), 'w', encoding='utf-8') as f:
        json.dump(res, f, indent=2, ensure_ascii=False)

    # laporan.md
    L = []
    L.append('# Spesifikasi Implementasi dari Mockup\n')
    L.append(f"**Sumber:** `{os.path.basename(args.image)}`  ")
    L.append(f"**Ukuran asli:** {W}×{H}px  ")
    L.append(f"**Skala:** {scale}× → kanvas CSS **{round(W/scale)}×{round(H/scale)}px** ({note})\n")
    L.append('## Palet Warna\n')
    L.append('| Hex | Porsi | Peran |')
    L.append('|---|---|---|')
    for p in pal:
        L.append(f"| `{p['hex']}` | {p['pct']}% | {p['role']} |")
    L.append(f"\n**Skala grid:** {grid['scale']}px (keyakinan {grid['confidence']}%)\n")
    L.append(f"## Blok Layout ({len(blocks)})\n")
    L.append('| # | Peran | Posisi (CSS px) | Ukuran | Radius | Warna |')
    L.append('|---|---|---|---|---|---|')
    for i, b in enumerate(blocks, 1):
        c = b['css']
        L.append(f"| {i} | {b['role']} | {c['left']},{c['top']} | {c['width']}×{c['height']} | {c['radius']}px | `{b['color']}` |")
    L.append(f"\n## Aset ({len(assets)})\n")
    L.append('| File | Peran | Ukuran | Saran |')
    L.append('|---|---|---|---|')
    for a in assets:
        L.append(f"| `assets/{a['file']}` | {a['role']} | {a['w']}×{a['h']} | {'vektorisasi ke SVG' if a['svg_recommended'] else 'crop ulang / cari padanan'} |")
    with open(os.path.join(args.out, 'laporan.md'), 'w', encoding='utf-8') as f:
        f.write('\n'.join(L) + '\n')

    print(f"Mockup   : {W}x{H}px -> CSS {round(W/scale)}x{round(H/scale)} @ {scale}x")
    print(f"Grid     : {grid['scale']}px ({grid['confidence']}%)")
    print(f"Blok     : {len(blocks)}")
    for i, b in enumerate(blocks[:20], 1):
        print(f"  {i:2d}. {b['role']:16s} {b['w']:4d}x{b['h']:<4d} @({b['x']},{b['y']}) r={b['radius_px']} {b['color']}")
    print(f"Aset     : {res['asset_summary']}")
    print(f"Output   : {args.out}/spek.json, laporan.md, assets/")


if __name__ == '__main__':
    main()
