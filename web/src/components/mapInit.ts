/**
 * Setup dasar MapLibre yang dipakai bersama oleh halaman Peta dan pemilih koordinat
 * di Admin. Ditaruh terpisah supaya tidak ada dua tempat yang mengurus worker.
 *
 * Catatan penting: dipakai maplibre-gl v5. Di v5 worker sudah tertanam di bundel,
 * jadi tidak perlu setWorkerUrl. Di v6 worker diambil dari file terpisah dan sempat
 * gagal dimuat setelah bundel dipecah (peta hitam tanpa tile).
 */
import { Map as MapLibre, type StyleSpecification } from 'maplibre-gl'
import 'maplibre-gl/dist/maplibre-gl.css'

const CARTO_KEY = (import.meta.env.VITE_CARTO_API_KEY as string | undefined) ?? ''

export const CARTO_VECTOR = CARTO_KEY
  ? `https://basemaps.cartocdn.com/gl/dark-matter-gl-style/style.json?key=${CARTO_KEY}`
  : ''

// Cadangan tanpa key: raster gelap CARTO (tampil, tapi ada watermark & tidak sehalus vektor).
export const DARK_RASTER = {
  type: 'raster' as const,
  tiles: [
    'https://a.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}.png',
    'https://b.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}.png',
  ],
  tileSize: 256,
  attribution: '© OpenStreetMap contributors, © CARTO',
}

export const SAT_RASTER = {
  type: 'raster' as const,
  tiles: ['https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}'],
  tileSize: 256,
  attribution: 'Imagery © Esri, Maxar, Earthstar Geographics',
}

export function rasterBaseStyle(): StyleSpecification {
  return { version: 8, sources: { base: DARK_RASTER }, layers: [{ id: 'base', type: 'raster', source: 'base' }] }
}

export type SimpleMapOpts = {
  container: HTMLElement
  center: [number, number]
  zoom: number
}

export function createMap({ container, center, zoom }: SimpleMapOpts): MapLibre {
  return new MapLibre({
    container,
    center,
    zoom,
    attributionControl: { compact: true },
    // Gaya vektor bila ada API key; kalau tidak, raster gelap CARTO.
    style: CARTO_VECTOR || rasterBaseStyle(),
  })
}
