import { useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import CameraTile from '../components/CameraTile'
import UnlockDialog from '../components/UnlockDialog'
import { useCatalog } from '../hooks'
import type { Cluster } from '../api'

export default function Home() {
  const { data, error, reload } = useCatalog()
  const nav = useNavigate()
  const [q, setQ] = useState('')
  const [unlock, setUnlock] = useState<Cluster | null>(null)

  const term = q.trim().toLowerCase()
  const match = (s: string) => s.toLowerCase().includes(term)
  const clusters = useMemo(
    () => data?.clusters.filter((c) => !term || match(c.name) || match(c.description)) ?? [],
    [data, term], // eslint-disable-line react-hooks/exhaustive-deps
  )
  const loose = useMemo(
    () => data?.cameras.filter((c) => !c.clusterId && (!term || match(c.name) || match(c.location))) ?? [],
    [data, term], // eslint-disable-line react-hooks/exhaustive-deps
  )

  if (error) return <div className="page"><p className="error">{error}</p></div>
  if (!data) return <div className="page"><p className="muted">Memuat…</p></div>

  return (
    <>
      <header className="hero">
        <div className="container">
          <h1>{data.site.site_title}</h1>
          <p>{data.site.site_description}</p>
          <input className="search" type="search" placeholder="Cari cluster atau kamera…" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Cari" />
        </div>
      </header>

      <main className="container page">
        {clusters.length > 0 && (
          <section>
            <h2>Cluster</h2>
            <div className="grid">
              {clusters.map((c) => {
                const locked = c.locked && !c.unlocked
                return (
                  <button key={c.id} className="card card-click" onClick={() => (locked ? setUnlock(c) : nav(`/c/${c.slug}`))}>
                    <div className="row between">
                      <strong>{c.name}</strong>
                      <span className={`chip ${c.locked ? 'chip-lock' : 'chip-free'}`}>{c.locked ? (c.unlocked ? 'Terbuka' : '🔒 Berkode') : 'Gratis'}</span>
                    </div>
                    {c.description && <p className="muted">{c.description}</p>}
                    <span className="muted small">{c.cameraCount} kamera</span>
                  </button>
                )
              })}
            </div>
          </section>
        )}

        {loose.length > 0 && (
          <section>
            <h2>Kamera umum</h2>
            <div className="grid grid-tiles">
              {loose.map((c) => <CameraTile key={c.id} cam={c} onOpen={() => nav(`/v/${c.id}`)} />)}
            </div>
          </section>
        )}

        {clusters.length === 0 && loose.length === 0 && (
          <p className="muted">{term ? 'Tidak ada hasil.' : 'Belum ada kamera. Admin dapat menambahkannya lewat panel admin.'}</p>
        )}
      </main>

      <footer className="container footer muted small">
        <Link to="/admin">Admin</Link>
      </footer>

      {unlock && (
        <UnlockDialog
          kind="cluster" id={unlock.id} title={unlock.name}
          onClose={() => setUnlock(null)}
          onUnlocked={() => { const s = unlock.slug; setUnlock(null); reload(); nav(`/c/${s}`) }}
        />
      )}
    </>
  )
}
