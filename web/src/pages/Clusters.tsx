import { useEffect, useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import UnlockDialog from '../components/UnlockDialog'
import { useCatalog } from '../hooks'
import type { Cluster } from '../api'

type Filter = 'semua' | 'gratis' | 'berkode'

/**
 * Halaman daftar seluruh cluster (/cluster).
 *
 * Sebelumnya tombol "Lihat Semua →" di Beranda hanya `href="#"` sehingga tampak
 * rusak. Halaman ini memberi tempat nyata untuk melihat semua cluster, mencari
 * cepat, dan menyaring mana yang gratis atau butuh kode akses.
 */
export default function Clusters() {
  const { data, error, reload } = useCatalog()
  const nav = useNavigate()
  const [q, setQ] = useState('')
  const [filter, setFilter] = useState<Filter>('semua')
  const [unlock, setUnlock] = useState<Cluster | null>(null)

  useEffect(() => { document.title = 'Semua Cluster — ZKNet' }, [])

  const term = q.trim().toLowerCase()
  const list = useMemo(() => {
    const all = data?.clusters ?? []
    return all.filter((c) => {
      const locked = c.locked && !c.unlocked
      if (filter === 'gratis' && locked) return false
      if (filter === 'berkode' && !locked) return false
      if (!term) return true
      return c.name.toLowerCase().includes(term) || (c.description ?? '').toLowerCase().includes(term)
    })
  }, [data, filter, term])

  const total = data?.clusters.length ?? 0
  const lockedCount = (data?.clusters ?? []).filter((c) => c.locked && !c.unlocked).length

  const open = (c: Cluster) => (c.locked && !c.unlocked ? setUnlock(c) : nav(`/c/${c.slug}`))

  if (error) return <div className="zk-app zk-app--plain"><main className="zk-main"><div className="zk-page"><p className="error">{error}</p><Link className="zk-link" to="/">← Beranda</Link></div></main></div>
  if (!data) return <div className="zk-app zk-app--plain"><main className="zk-main"><div className="zk-page"><p className="muted">Memuat…</p></div></main></div>

  return (
    <div className="zk-app zk-app--plain">
      <main className="zk-main">
        <div className="zk-page">
          <nav className="zk-crumbs"><Link to="/" className="zk-link">← Beranda</Link></nav>

          <div className="zk-panel__head" style={{ marginBottom: '1.25rem' }}>
            <h1 className="zk-h2"><svg className="zk-icon"><use href="#i-users" /></svg> Semua Cluster</h1>
            <span className="zk-text-sm">{total} cluster · {lockedCount} butuh kode</span>
          </div>

          <div className="zk-cluster-tools">
            <label className="zk-search" style={{ minWidth: 0 }}>
              <svg className="zk-icon"><use href="#i-search" /></svg>
              <input
                type="search"
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder="Cari cluster…"
                aria-label="Cari cluster"
              />
            </label>
            <div className="zk-chips" role="group" aria-label="Saring cluster">
              {(['semua', 'gratis', 'berkode'] as Filter[]).map((f) => (
                <button
                  key={f}
                  className={`zk-chip-btn${filter === f ? ' is-on' : ''}`}
                  onClick={() => setFilter(f)}
                  aria-pressed={filter === f}
                >
                  {f === 'semua' ? 'Semua' : f === 'gratis' ? 'Gratis' : 'Berkode'}
                </button>
              ))}
            </div>
          </div>

          <div className="zk-stack">
            {list.map((c, i) => (
              <ClusterCard key={c.id} cluster={c} index={i} onOpen={() => open(c)} />
            ))}
            {list.length === 0 && (
              <p className="muted">
                {total === 0 ? 'Belum ada cluster.' : 'Tidak ada cluster yang cocok dengan pencarian/saringan.'}
              </p>
            )}
          </div>
        </div>
      </main>

      {unlock && (
        <UnlockDialog
          kind="cluster"
          id={unlock.id}
          title={unlock.name}
          onClose={() => setUnlock(null)}
          onUnlocked={() => { const slug = unlock.slug; setUnlock(null); reload(); nav(`/c/${slug}`) }}
        />
      )}
    </div>
  )
}

function ClusterCard({ cluster, onOpen, index = 0 }: { cluster: Cluster; onOpen: () => void; index?: number }) {
  const locked = cluster.locked && !cluster.unlocked
  const phClass = `ph${(index % 4) + 1}`
  return (
    <div
      className="zk-list-item"
      onClick={onOpen}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onOpen() } }}
      style={{ cursor: 'pointer', width: '100%', textAlign: 'left', border: '1px solid var(--zk-border)', background: 'var(--zk-surface-2)' }}
    >
      <div className={`zk-list-item__thumb ${phClass}`} style={{ display: 'grid', placeItems: 'center', fontWeight: 800, fontSize: '1.25rem', color: '#fff' }}>
        {cluster.name.slice(0, 2).toUpperCase()}
      </div>
      <div className="zk-list-item__body">
        <h3 className="zk-list-item__title">{cluster.name}</h3>
        <p className="zk-list-item__desc">{cluster.description || 'Kamera CCTV publik'}<br />{cluster.cameraCount} kamera</p>
      </div>
      <div className="zk-list-item__aside">
        <span className={`zk-badge ${locked ? 'zk-badge--locked' : 'zk-badge--online'}`}>
          {locked && <svg className="zk-icon" style={{ width: 12, height: 12 }}><use href="#i-lock" /></svg>}
          {locked ? 'Berkode' : 'Gratis'}
        </span>
        <svg className="zk-icon zk-list-item__chev"><use href="#i-chev" /></svg>
      </div>
    </div>
  )
}
