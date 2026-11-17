import { useEffect, useRef, useState } from 'react'
import { Marker, NavigationControl, ScaleControl, type Map as MlMap, type StyleSpecification } from 'maplibre-gl'
import { CARTO_VECTOR, DARK_RASTER, SAT_RASTER, createMap } from './mapInit'
import type { Camera } from '../api'

/**
 * Peta bergaya OSIRIS: kanvas gelap penuh, marker bulat bercahaya, rail layer di kiri,
 * dan pemilih tampilan 3D / 2D / MAP / SAT di kiri-bawah.
 *
 * Gaya dasar: CARTO Dark Matter (vektor, butuh API key) dengan cadangan raster gelap.
 * Mode SAT memakai Esri World Imagery sebagai raster overlay.
 * Semua urusan worker & gaya dasar ada di mapInit.ts.
 */

export type ViewMode = '3d' | '2d' | 'map' | 'sat'


function fallbackStyle(): StyleSpecification {
  return {
    version: 8,
    sources: { dark: DARK_RASTER },
    layers: [{ id: 'dark', type: 'raster', source: 'dark' }],
  }
}

export interface MapViewProps {
  cameras: Camera[]
  selectedId: string | null
  onSelect: (camera: Camera) => void
  /**
   * Minta peta menyesuaikan area tampilan. `key` berubah => peta zoom ke
   * sebaran `points`. Dipakai filter cluster: pilih "CCTV Bantul" maka peta
   * pindah & zoom ke area Bantul, pilih "Semua" kembali ke seluruh DIY.
   */
  focus?: { key: string; points: Camera[] }
}

export default function MapView({ cameras, selectedId, onSelect, focus }: MapViewProps) {
  const boxRef = useRef<HTMLDivElement>(null)
  const mapRef = useRef<MlMap | null>(null)
  const markersRef = useRef<Marker[]>([])
  const [mode, setMode] = useState<ViewMode>('map')
  const [ready, setReady] = useState(false)
  const [failed, setFailed] = useState('')
  const selectRef = useRef(onSelect)
  selectRef.current = onSelect

  // 1) Buat peta sekali.
  useEffect(() => {
    if (!boxRef.current) return
    let map: MlMap | null = null
    const m = createMap({
      container: boxRef.current,
      center: [110.3695, -7.8750], // DIY
      zoom: 10.6,
    })
    map = m
    m.setMinZoom(8); m.setMaxZoom(18)
    m.addControl(new NavigationControl({ visualizePitch: true }), 'bottom-right')
    m.addControl(new ScaleControl({ unit: 'metric' }), 'bottom-right')
    m.on('load', () => setReady(true))
    m.on('error', (e) => {
      const msg = (e as { error?: { message?: string } })?.error?.message ?? ''
      if (/style|fetch|style\.json|glyphs/i.test(msg)) {
        setFailed('Gaya peta vektor gagal dimuat. Memakai peta cadangan gelap.')
        try { m.setStyle(fallbackStyle()) } catch { /* biarkan */ }
      }
    })
    mapRef.current = m
    return () => {
      markersRef.current.forEach((m) => m.remove())
      markersRef.current = []
      map?.remove()
      mapRef.current = null
    }
  }, [])

  // 2) Marker kamera. Kamera tanpa koordinat TIDAK digambar (jangan di 0,0).
  useEffect(() => {
    const map = mapRef.current
    if (!map || !ready) return
    markersRef.current.forEach((m) => m.remove())
    markersRef.current = []

    for (const cam of cameras) {
      if (typeof cam.lat !== 'number' || typeof cam.lng !== 'number') continue
      const el = document.createElement('button')
      el.type = 'button'
      el.className = 'os-mk' + (cam.status === 'offline' ? ' is-offline' : '') + (cam.id === selectedId ? ' is-active' : '')
      el.title = cam.name
      el.setAttribute('aria-label', cam.name)
      el.innerHTML = '<span class="os-mk__dot"></span><span class="os-mk__ring"></span>'
      el.addEventListener('click', (ev) => {
        ev.stopPropagation()
        selectRef.current(cam)
      })
      const marker = new Marker({ element: el, anchor: 'center' }).setLngLat([cam.lng, cam.lat]).addTo(map)
      markersRef.current.push(marker)
    }
  }, [cameras, ready, selectedId])

  // 3) Ganti mode tampilan.
  useEffect(() => {
    const map = mapRef.current
    if (!map || !ready) return
    const sat = () => {
      if (!map.getSource('sat')) {
        map.addSource('sat', SAT_RASTER)
        map.addLayer({ id: 'sat-layer', type: 'raster', source: 'sat' }, undefined)
      }
      map.setLayoutProperty('sat-layer', 'visibility', 'visible')
    }
    const hideSat = () => {
      if (map.getLayer('sat-layer')) map.setLayoutProperty('sat-layer', 'visibility', 'none')
    }
    try {
      if (mode === '3d') {
        hideSat()
        map.setProjection({ type: 'mercator' })
        map.easeTo({ pitch: 55, bearing: -18, duration: 600 })
      } else if (mode === '2d') {
        hideSat()
        map.setProjection({ type: 'mercator' })
        map.easeTo({ pitch: 0, bearing: 0, duration: 600 })
      } else if (mode === 'map') {
        hideSat()
        map.setProjection({ type: 'mercator' })
        map.easeTo({ pitch: 0, bearing: 0, duration: 600 })
      } else if (mode === 'sat') {
        sat()
        map.easeTo({ pitch: 0, bearing: 0, duration: 600 })
      }
    } catch {
      /* setProjection bisa tidak tersedia pada build lama */
    }
  }, [mode, ready])

  // 4) Fokus ke kamera terpilih.
  useEffect(() => {
    const map = mapRef.current
    if (!map || !selectedId) return
    const cam = cameras.find((c) => c.id === selectedId)
    if (!cam || typeof cam.lat !== 'number' || typeof cam.lng !== 'number') return
    map.flyTo({ center: [cam.lng, cam.lat], zoom: 15.5, duration: 900 })
  }, [selectedId, cameras])

  // 5) Sesuaikan tampilan ke sebaran koordinat saat filter cluster berubah.
  useEffect(() => {
    const map = mapRef.current
    if (!map || !ready || !focus) return
    const pts = focus.points.filter((c) => typeof c.lat === 'number' && typeof c.lng === 'number')
    if (pts.length === 0) return

    if (pts.length === 1) {
      // Satu kamera: fitBounds akan gagal (luas nol), jadi terbang langsung.
      map.flyTo({ center: [pts[0].lng as number, pts[0].lat as number], zoom: 15, duration: 900 })
      return
    }
    let w = Infinity, s = Infinity, e = -Infinity, n = -Infinity
    for (const p of pts) {
      const lng = p.lng as number
      const lat = p.lat as number
      if (lng < w) w = lng
      if (lng > e) e = lng
      if (lat < s) s = lat
      if (lat > n) n = lat
    }
    map.fitBounds([[w, s], [e, n]], {
      padding: { top: 70, right: 70, bottom: 70, left: 70 },
      maxZoom: 14, // cluster kecil jangan sampai terlalu dekat
      duration: 1000,
    })
    // Sengaja hanya bergantung pada focus.key: perubahan daftar kamera (mis. status
    // online/offline) tidak boleh membuat peta melompat sendiri.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focus?.key, ready])

  return (
    <div className={`os-map${selectedId ? " has-detail" : ""}`}>
      <div className="os-map__canvas" ref={boxRef} />

      <div className="os-rail" role="group" aria-label="Layer">
        <span className="os-rail__title">LAYERS</span>
        <button className="os-rail__btn is-on" title="CCTV">
          <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 8h11v8H4zM15 11l5-3v8l-5-3z" fill="none" stroke="currentColor" strokeWidth="1.6" /></svg>
          <em>{cameras.length}</em>
        </button>
      </div>

      <div className="os-modes" role="group" aria-label="Mode tampilan">
        {(['3d', '2d', 'map', 'sat'] as ViewMode[]).map((m) => (
          <button key={m} className={mode === m ? 'is-on' : ''} onClick={() => setMode(m)}>
            {m === 'sat' ? 'SAT' : m.toUpperCase()}
          </button>
        ))}
      </div>

      {failed && <div className="os-map__warn">{failed}</div>}
    </div>
  )
}
