import { useEffect, useMemo, useRef, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import AppShell from '../components/AppShell'
import UnlockDialog from '../components/UnlockDialog'
import { useCatalog } from '../hooks'
import { cameraBadge, formatChecked } from '../status'
import type { Camera, Cluster } from '../api'

export default function Home() {
  const { data, error, reload } = useCatalog()
  const nav = useNavigate()
  const [q, setQ] = useState('')
  const [unlock, setUnlock] = useState<Cluster | null>(null)
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid')
  const [notifOpen, setNotifOpen] = useState(false)
  const searchRef = useRef<HTMLInputElement>(null)

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
  const featuredCluster = clusters[0]
  const featuredCameras = useMemo(() => {
    if (!data) return []
    const clusterCameras = featuredCluster ? data.cameras.filter((camera) => camera.clusterId === featuredCluster.id) : []
    return [...clusterCameras, ...loose].filter((camera) => !term || match(camera.name) || match(camera.location)).slice(0, 9)
  }, [data, featuredCluster, loose, term])
  const protectedCount = data?.cameras.filter((camera) => camera.locked).length ?? 0
  const onlineCount = data?.cameras.filter((camera) => camera.status === 'online').length ?? 0
  const offlineCount = data?.cameras.filter((camera) => camera.status === 'offline').length ?? 0
  const uncheckedCount = data?.cameras.filter((camera) => (camera.status ?? 'unknown') === 'unknown').length ?? 0

  // Pintasan ⌘K / Ctrl+K memfokuskan kolom cari; Escape mengosongkan & menutup notifikasi.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault()
        searchRef.current?.focus()
        searchRef.current?.select()
        return
      }
      if (e.key === 'Escape') {
        setNotifOpen(false)
        if (document.activeElement === searchRef.current) {
          setQ('')
          searchRef.current?.blur()
        }
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  if (error) return <div className="page"><p className="error">{error}</p></div>
  if (!data) return <div className="page"><p className="muted">Memuat…</p></div>

  return (
    <>
    <AppShell
      title="ZKNet CCTV"
      subtitle="Pemantauan kamera CCTV publik di wilayah layanan ZKNet."
      search={(
        <label className="zk-search">
        <svg className="zk-icon"><use href="#i-search"/></svg>
        <input ref={searchRef} type="search" placeholder="Cari kamera, lokasi, atau cluster…" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Cari kamera, lokasi, atau cluster" />
        <span className="zk-kbd">⌘ K</span>
        </label>
      )}
      actions={(
        <>
                <div className="zk-notif">
                  <button
                    className="zk-icon-btn"
                    aria-label="Notifikasi"
                    aria-expanded={notifOpen}
                    onClick={() => setNotifOpen((v) => !v)}
                  >
                    <svg className="zk-icon"><use href="#i-bell"/></svg>
                    {/* Titik merah hanya bila memang ada kamera bermasalah. */}
                    {offlineCount > 0 && <span className="zk-dot"></span>}
                  </button>
                  {notifOpen && (
                    <>
                      <div className="zk-notif__backdrop" onClick={() => setNotifOpen(false)} aria-hidden="true" />
                      <div className="zk-notif__panel" role="dialog" aria-label="Notifikasi">
                        <div className="zk-notif__head">
                          <strong>Notifikasi</strong>
                          {data.lastCheckAt && <span>{formatChecked(data.lastCheckAt)}</span>}
                        </div>
                        {offlineCount === 0 && uncheckedCount === 0 && (
                          <p className="zk-notif__empty">Semua kamera terpantau normal.</p>
                        )}
                        {offlineCount > 0 && (
                          <ul className="zk-notif__list">
                            {data.cameras.filter((c) => c.status === 'offline').slice(0, 5).map((c) => (
                              <li key={c.id}>
                                <Link to={`/v/${c.id}`} onClick={() => setNotifOpen(false)}>{c.name}</Link>
                                <em>offline</em>
                              </li>
                            ))}
                            {offlineCount > 5 && <li className="zk-notif__more">+{offlineCount - 5} kamera lain</li>}
                          </ul>
                        )}
                        {uncheckedCount > 0 && (
                          <p className="zk-notif__note">{uncheckedCount} kamera belum diperiksa.</p>
                        )}
                        <Link className="zk-notif__foot" to="/status" onClick={() => setNotifOpen(false)}>
                          Lihat status jaringan →
                        </Link>
                      </div>
                    </>
                  )}
                </div>
                <Link to="/admin" className="zk-avatar" aria-label="Masuk admin" title="Masuk admin">
                  <svg className="zk-icon"><use href="#i-user"/></svg>
                </Link>
        </>
      )}
    >

          <section className="zk-hero" style={{ '--zk-hero-img': 'url(/dashboard-banner.png)' } as any}>
            <h2 className="zk-hero__title">Pantau Lingkungan Desa Lebih Aman dan Nyaman</h2>
            <p className="zk-hero__sub">CCTV publik untuk keamanan, ketertiban, dan kenyamanan bersama.</p>
            <div className="zk-hero__chips">
              <span className="zk-chip zk-chip--blue"><svg className="zk-icon"><use href="#i-shield"/></svg>Keamanan Lingkungan</span>
              <span className="zk-chip zk-chip--blue"><svg className="zk-icon"><use href="#i-users"/></svg>Kenyamanan Warga</span>
              <span className="zk-chip zk-chip--green"><svg className="zk-icon"><use href="#i-home"/></svg>Desa Makin Tertata</span>
            </div>
          </section>

          <div className="zk-grid-stats" id="status">
            <div className="zk-stat zk-stat--primary"><div className="zk-stat__icon"><svg className="zk-icon"><use href="#i-cam"/></svg></div><div><div className="zk-stat__label">Total Kamera</div><div className="zk-stat__value">{data.cameras.length}</div></div></div>
            <div className="zk-stat zk-stat--success"><div className="zk-stat__icon"><svg className="zk-icon"><use href="#i-radio"/></svg></div><div><div className="zk-stat__label">Online</div><div className="zk-stat__value">{onlineCount}</div></div></div>
            <div className="zk-stat zk-stat--danger"><div className="zk-stat__icon"><svg className="zk-icon"><use href="#i-radio"/></svg></div><div><div className="zk-stat__label">Offline</div><div className="zk-stat__value">{offlineCount}</div></div></div>
            <div className="zk-stat zk-stat--violet"><div className="zk-stat__icon"><svg className="zk-icon"><use href="#i-lock"/></svg></div><div><div className="zk-stat__label">Perlu Kode</div><div className="zk-stat__value">{protectedCount}</div></div></div>
            <Link className={`zk-stat zk-stat--status ${offlineCount > 0 ? 'zk-stat--danger' : ''}`} to="/status">
              <div style={{display:'flex',gap:'12px',alignItems:'center'}}>
                <span className="zk-status-dot" data-state={offlineCount > 0 ? 'warn' : uncheckedCount > 0 ? 'idle' : 'ok'}></span>
                <div><div className="zk-text-sm">Status Jaringan</div><div style={{fontWeight:700}}>{offlineCount > 0 ? `${offlineCount} kamera offline` : uncheckedCount > 0 ? 'Memeriksa…' : 'Semua normal'}</div></div>
              </div>
              <svg className="zk-icon"><use href="#i-chev"/></svg>
            </Link>
          </div>
          {data.lastCheckAt && <p className="zk-text-sm zk-muted" style={{margin:'-0.5rem 0 0'}}>Status kamera terakhir diperiksa {formatChecked(data.lastCheckAt)}.</p>}

          <div className="zk-grid-split">
            <div className="zk-stack">
              <section className="zk-panel" id="cluster">
                <div className="zk-panel__head">
                  <h2 className="zk-h2"><svg className="zk-icon"><use href="#i-users"/></svg>Daftar Cluster</h2>
                  {/* Halaman /cluster punya pencarian + filter Gratis/Berkode sendiri. */}
                  {data.clusters.length > 0 && (
                    <Link className="zk-link" to="/cluster">Lihat Semua &rarr;</Link>
                  )}
                </div>
                <div className="zk-stack">
                  {clusters.map((cluster, i) => (
                    <ClusterRow key={cluster.id} cluster={cluster} index={i} onOpen={() => (cluster.locked && !cluster.unlocked ? setUnlock(cluster) : nav(`/c/${cluster.slug}`))} />
                  ))}
                  {clusters.length === 0 && <p className="muted">Tidak ada cluster yang cocok dengan pencarian.</p>}
                </div>
              </section>

              <section className="zk-promo" aria-label="Iklan Pasang Internet ZKNet">
                <div className="zk-promo__mascot" aria-hidden="true" />
                <div className="zk-promo__content">
                  <div className="zk-promo__main">
                    <h3 className="zk-promo__heading">
                      <span>Internet Stabil</span>
                      <span>di Rumah &amp; Usaha?</span>
                    </h3>
                    <p className="zk-promo__sub">Pasang internet ZKNet sekarang!</p>
                  </div>
                  <a className="zk-promo__btn" href="https://wa.me/6285640420791" target="_blank" rel="noreferrer" aria-label="Hubungi kami via WhatsApp 085640420791">
                    <div className="zk-promo__btn-icon">
                      <svg className="zk-icon"><use href="#i-whatsapp"/></svg>
                    </div>
                    <div className="zk-promo__btn-text">
                      <span className="zk-promo__btn-label">Hubungi Kami</span>
                      <span className="zk-promo__btn-phone">085640420791</span>
                    </div>
                  </a>
                </div>
              </section>
            </div>

            <section className="zk-panel" id="cctv-publik">
              <div className="zk-panel__head">
                <h2 className="zk-h2"><svg className="zk-icon"><use href="#i-video"/></svg>{featuredCluster ? featuredCluster.name : 'CCTV Publik'}</h2>
                <div className="zk-panel__tools">
                  <div className="zk-segmented" role="group" aria-label="Tampilan">
                    <button aria-pressed={viewMode === 'grid'} onClick={() => setViewMode('grid')} aria-label="Grid"><svg className="zk-icon"><use href="#i-grid"/></svg></button>
                    <button aria-pressed={viewMode === 'list'} onClick={() => setViewMode('list')} aria-label="Daftar"><svg className="zk-icon"><use href="#i-list"/></svg></button>
                  </div>
                </div>
              </div>

              {viewMode === 'grid' ? (
                <div className="zk-grid-cams" style={{'--zk-cols':3} as any}>
                  {featuredCameras.map((camera, i) => (
                    <DashboardCameraCard key={camera.id} camera={camera} index={i} onOpen={() => nav(`/v/${camera.id}`)} />
                  ))}
                  {featuredCameras.length === 0 && <p className="muted">Belum ada kamera untuk ditampilkan.</p>}
                </div>
              ) : (
                <div className="zk-cams-list">
                  {featuredCameras.map((camera) => (
                    <DashboardCameraRow key={camera.id} camera={camera} onOpen={() => nav(`/v/${camera.id}`)} />
                  ))}
                  {featuredCameras.length === 0 && <p className="muted">Belum ada kamera untuk ditampilkan.</p>}
                </div>
              )}
            </section>
          </div>

          {loose.length > 0 && !featuredCluster && (
            <section className="zk-panel">
              <h2>Kamera umum</h2>
              <div className="zk-grid-cams" style={{'--zk-cols':4} as any}>
                {loose.map((camera, i) => (
                  <DashboardCameraCard key={camera.id} camera={camera} index={i} onOpen={() => nav(`/v/${camera.id}`)} />
                ))}
              </div>
            </section>
          )}
    </AppShell>

      {unlock && <UnlockDialog kind="cluster" id={unlock.id} title={unlock.name} onClose={() => setUnlock(null)} onUnlocked={() => { const slug = unlock.slug; setUnlock(null); reload(); nav(`/c/${slug}`) }} />}
    </>
  )
}

function ClusterRow({ cluster, onOpen, index = 0 }: { cluster: Cluster; onOpen: () => void; index?: number }) {
  const locked = cluster.locked && !cluster.unlocked
  const phClass = `ph${(index % 4) + 1}`
  return (
    <div className="zk-list-item" onClick={onOpen} role="button" tabIndex={0} style={{cursor: 'pointer', width: '100%', textAlign: 'left', border: '1px solid var(--zk-border)', background: 'var(--zk-surface-2)'}}>
      <div className={`zk-list-item__thumb ${phClass}`} style={{ display: 'grid', placeItems: 'center', fontWeight: 800, fontSize: '1.25rem', color: '#fff' }}>
        {cluster.name.slice(0, 2).toUpperCase()}
      </div>
      <div className="zk-list-item__body">
        <h3 className="zk-list-item__title">{cluster.name}</h3>
        <p className="zk-list-item__desc">{cluster.description || 'Kamera CCTV publik'}<br />{cluster.cameraCount} kamera</p>
      </div>
      <div className="zk-list-item__aside">
        <span className={`zk-badge ${locked ? 'zk-badge--locked' : 'zk-badge--online'}`}>
          {locked && <svg className="zk-icon" style={{width: 12, height: 12}}><use href="#i-lock"/></svg>}
          {locked ? 'Berkode' : 'Online'}
        </span>
        <svg className="zk-icon zk-list-item__chev"><use href="#i-chev"/></svg>
      </div>
    </div>
  )
}

function DashboardCameraCard({ camera, onOpen, index = 0 }: { camera: Camera; onOpen: () => void; index?: number }) {
  const phClass = `ph${(index % 4) + 1}`
  const badge = cameraBadge(camera)
  return (
    <div className={`zk-cam ${phClass}${camera.status === 'offline' ? ' zk-cam--offline' : ''}`} onClick={onOpen} role="button" tabIndex={0} style={{cursor: 'pointer'}}>
      <span className={`zk-badge ${badge.cls}`}>{badge.text}</span>
      {camera.locked && !camera.unlocked && (
        <span className="zk-badge zk-badge--locked" style={{position: 'absolute', top: 8, right: 8, zIndex: 1}}>
          <svg className="zk-icon" style={{width: 12, height: 12}}><use href="#i-lock"/></svg> Berkode
        </span>
      )}
      <div className="zk-cam__caption">
        <svg className="zk-icon" style={{width: 16, height: 16, flexShrink: 0}}><use href="#i-video"/></svg>
        <span>{camera.name}</span>
      </div>
    </div>
  )
}

function DashboardCameraRow({ camera, onOpen }: { camera: Camera; onOpen: () => void }) {
  const badge = cameraBadge(camera)
  return (
    <div className="zk-cam-row" onClick={onOpen} role="button" tabIndex={0}>
      <div className="zk-cam-row__info">
        <svg className="zk-icon" style={{width: 20, height: 20, color: 'var(--zk-primary-hi)', flexShrink: 0}}><use href="#i-video"/></svg>
        <div style={{minWidth: 0}}>
          <div className="zk-cam-row__name">{camera.name}</div>
          {camera.location && <div className="zk-cam-row__loc">{camera.location}</div>}
        </div>
      </div>
      <span className={`zk-badge ${badge.cls}`}>{badge.text}</span>
    </div>
  )
}
