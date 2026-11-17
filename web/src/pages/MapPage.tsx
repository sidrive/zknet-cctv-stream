import { useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import Player from '../components/Player'
import AppShell from '../components/AppShell'
import MapView from '../components/MapView'
import { useCatalog } from '../hooks'
import { STATUS_LABEL } from '../status'
import type { Camera } from '../api'

export default function MapPage() {
  const { data, error } = useCatalog()
  const nav = useNavigate()
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [q, setQ] = useState('')
  // '' = semua cluster. Bila diisi id cluster, peta hanya menampilkan cluster itu
  // dan otomatis zoom ke area cakupannya.
  const [cluster, setCluster] = useState('')

  const allCoords = useMemo(() => (data?.cameras ?? []).filter((c) => typeof c.lat === 'number' && typeof c.lng === 'number'), [data])
  const withCoords = useMemo(() => (cluster ? allCoords.filter((c) => c.clusterId === cluster) : allCoords), [allCoords, cluster])
  // Hanya cluster yang punya kamera berkoordinat: cluster terkunci tidak dikirim
  // koordinatnya oleh server, jadi tidak ada gunanya tampil di filter.
  const chips = useMemo(
    () => (data?.clusters ?? [])
      .map((cl) => ({ ...cl, count: allCoords.filter((c) => c.clusterId === cl.id).length }))
      .filter((cl) => cl.count > 0),
    [data, allCoords],
  )
  const activeChip = chips.find((cl) => cl.id === cluster) ?? null
  const selected = withCoords.find((c) => c.id === selectedId) ?? null
  const term = q.trim().toLowerCase()
  const results = useMemo(
    () => (term ? withCoords.filter((c) => c.name.toLowerCase().includes(term) || (c.location ?? '').toLowerCase().includes(term)).slice(0, 8) : []),
    [withCoords, term],
  )
  const offline = withCoords.filter((c) => c.status === 'offline').length

  if (error) return <AppShell title="Peta Lokasi"><p className="error">{error}</p><Link className="zk-link" to="/">← Kembali</Link></AppShell>
  if (!data) return <AppShell title="Peta Lokasi"><p className="muted">Memuat peta…</p></AppShell>

  const pick = (c: Camera) => { setSelectedId(c.id); setQ('') }
  // Saat cluster berganti, pilihan kamera direset agar panel detail tidak
  // menampilkan kamera yang markernya sudah tidak ada di peta.
  const changeCluster = (id: string) => { setCluster(id); setSelectedId(null); setQ('') }

  return (
    <AppShell
      title="Peta Lokasi"
      subtitle={`${activeChip ? `${activeChip.name} · ` : ''}${withCoords.length} kamera berkoordinat${offline ? ` · ${offline} offline` : ''}`}
    >
      <div className="os-page">
        <div className="os-topbar">
          <div className="os-chips" role="group" aria-label="Filter cluster">
            <button className={cluster === '' ? 'is-on' : ''} onClick={() => changeCluster('')} aria-pressed={cluster === ''}>
              Semua<em>{allCoords.length}</em>
            </button>
            {chips.map((cl) => (
              <button
                key={cl.id}
                className={cluster === cl.id ? 'is-on' : ''}
                onClick={() => changeCluster(cl.id)}
                aria-pressed={cluster === cl.id}
              >
                {cl.name.replace(/^CCTV\s+/i, '')}<em>{cl.count}</em>
              </button>
            ))}
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
          <MapView
            cameras={withCoords}
            selectedId={selectedId}
            onSelect={pick}
            focus={{ key: cluster || 'all', points: withCoords }}
          />

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
      </div>
    </AppShell>
  )
}
