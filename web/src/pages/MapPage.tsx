import { useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import Player from '../components/Player'
import MapView from '../components/MapView'
import { useCatalog } from '../hooks'
import { STATUS_LABEL } from '../status'
import type { Camera } from '../api'

export default function MapPage() {
  const { data, error } = useCatalog()
  const nav = useNavigate()
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [q, setQ] = useState('')

  const withCoords = useMemo(() => (data?.cameras ?? []).filter((c) => typeof c.lat === 'number' && typeof c.lng === 'number'), [data])
  const selected = withCoords.find((c) => c.id === selectedId) ?? null
  const term = q.trim().toLowerCase()
  const results = useMemo(
    () => (term ? withCoords.filter((c) => c.name.toLowerCase().includes(term) || (c.location ?? '').toLowerCase().includes(term)).slice(0, 8) : []),
    [withCoords, term],
  )
  const offline = withCoords.filter((c) => c.status === 'offline').length

  if (error) return <div className="zk-app zk-app--plain"><main className="zk-main"><p className="error">{error}</p><Link to="/">← Kembali</Link></main></div>
  if (!data) return <div className="zk-app zk-app--plain"><main className="zk-main"><p className="muted">Memuat…</p></main></div>

  const pick = (c: Camera) => { setSelectedId(c.id); setQ('') }

  return (
    <div className="zk-app zk-app--plain">
      <main className="zk-main os-page">
        <div className="os-topbar">
          <Link to="/" className="os-back" aria-label="Kembali">←</Link>
          <div className="os-title">
            <strong>PETA LOKASI</strong>
            <span>{withCoords.length} kamera berkoordinat{offline ? ` · ${offline} offline` : ''}</span>
          </div>
          <label className="os-search">
            <svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="11" cy="11" r="7" fill="none" stroke="currentColor" strokeWidth="1.7" /><path d="m16 16 5 5" stroke="currentColor" strokeWidth="1.7" /></svg>
            <input type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Cari kamera atau lokasi…" aria-label="Cari kamera di peta" />
          </label>
            {results.length > 0 && (
              <ul className="os-results">
                {results.map((c) => (
                  <li key={c.id}>
                    <button onClick={() => pick(c)}>
                      <span>{c.name}</span>
                      <em>{c.location || STATUS_LABEL[c.status]}</em>
                    </button>
                  </li>
                ))}
              </ul>
            )}
        </div>

        <div className="os-stage">
          <MapView cameras={withCoords} selectedId={selectedId} onSelect={pick} />

          {selected && (
            <aside className="os-detail">
              <header>
                <div>
                  <strong>{selected.name}</strong>
                  <span>{selected.location || 'Tanpa lokasi'}</span>
                </div>
                <button className="os-x" onClick={() => setSelectedId(null)} aria-label="Tutup">✕</button>
              </header>
              <Player cameraId={selected.id} />
              <footer>
                <div className="os-fields">
                  <span>FEED TYPE<em>{selected.type.toUpperCase()}</em></span>
                  <span>STATUS<em className={selected.status === 'offline' ? 'is-bad' : 'is-ok'}>{STATUS_LABEL[selected.status].toUpperCase()}</em></span>
                  <span>KOORDINAT<em>{selected.lat?.toFixed(5)}, {selected.lng?.toFixed(5)}</em></span>
                </div>
                <button className="os-alink" onClick={() => nav(`/v/${selected.id}`)}>Buka halaman kamera →</button>
              </footer>
            </aside>
          )}
        </div>
      </main>
    </div>
  )
}
