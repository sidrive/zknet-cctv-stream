import { useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import UnlockDialog from '../components/UnlockDialog'
import { useCatalog } from '../hooks'
import type { Camera, Cluster } from '../api'

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
  const featuredCluster = clusters[0]
  const featuredCameras = useMemo(() => {
    if (!data) return []
    const clusterCameras = featuredCluster ? data.cameras.filter((camera) => camera.clusterId === featuredCluster.id) : []
    return [...clusterCameras, ...loose].filter((camera) => !term || match(camera.name) || match(camera.location)).slice(0, 9)
  }, [data, featuredCluster, loose, term])
  const protectedCount = data?.cameras.filter((camera) => camera.locked).length ?? 0

  if (error) return <div className="page"><p className="error">{error}</p></div>
  if (!data) return <div className="page"><p className="muted">Memuat…</p></div>

  return (
    <div className="zk-app">
      <aside className="zk-sidebar" aria-label="Navigasi utama">
        <Link className="zk-brand" to="/" aria-label={`${data.site.site_title}, beranda`}>
          <div className="zk-brand__name">zk<b>net</b></div>
          <div className="zk-brand__tag">Internet untuk Desa</div>
        </Link>

        <nav className="zk-nav">
          <a className="zk-nav__item is-active" href="#dashboard"><svg className="zk-icon"><use href="#i-home"/></svg>Dashboard</a>
          <a className="zk-nav__item" href="#cctv-publik"><svg className="zk-icon"><use href="#i-cam"/></svg>CCTV Publik</a>
          <a className="zk-nav__item" href="#cluster"><svg className="zk-icon"><use href="#i-users"/></svg>Cluster</a>
          <a className="zk-nav__item" href="#cctv-publik"><svg className="zk-icon"><use href="#i-map"/></svg>Peta Lokasi</a>
          <a className="zk-nav__item" href="#status"><svg className="zk-icon"><use href="#i-signal"/></svg>Status Jaringan</a>
          <Link className="zk-nav__item" to="/admin"><svg className="zk-icon"><use href="#i-gear"/></svg>Pengaturan</Link>
        </nav>
        <div className="zk-sidebar__footer zk-promo-side">
          <h3 className="zk-promo-side__title">Pasang Internet ZKNet</h3>
          <p className="zk-text-sm" style={{margin: 0}}>Internet stabil, buat kebutuhan rumah dan usaha Anda</p>
          <a className="zk-btn zk-btn--whatsapp zk-btn--sm" href="https://wa.me/6285640420791" target="_blank" rel="noreferrer">085640420791</a>
        </div>
      </aside>

      <main className="zk-main" id="dashboard">
        <header className="zk-topbar">
          <div className="zk-topbar__title">
            <h1>ZKNet CCTV</h1>
            <p>Pemantauan kamera CCTV publik di wilayah layanan ZKNet.</p>
          </div>
          <label className="zk-search"><svg className="zk-icon"><use href="#i-search"/></svg><input type="search" placeholder="Cari kamera, lokasi, atau cluster…" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Cari kamera, lokasi, atau cluster" /><span className="zk-kbd">⌘ K</span></label>
          <button className="zk-icon-btn" aria-label="Notifikasi"><svg className="zk-icon"><use href="#i-bell"/></svg><span className="zk-dot"></span></button>
          <div className="zk-avatar"><svg className="zk-icon"><use href="#i-user"/></svg></div>
        </header>

        <section className="zk-hero">
          <h2 className="zk-hero__title">Pantau Lingkungan Desa Lebih Aman dan Nyaman</h2>
          <p className="zk-hero__sub">CCTV publik untuk keamanan, ketertiban, dan kenyamanan bersama.</p>
          <div className="zk-hero__chips">
            <span className="zk-chip zk-chip--blue"><svg className="zk-icon"><use href="#i-shield"/></svg>Keamanan Lingkungan</span>
            <span className="zk-chip zk-chip--blue"><svg className="zk-icon"><use href="#i-users"/></svg>Kenyamanan Warga</span>
            <span className="zk-chip zk-chip--green"><svg className="zk-icon"><use href="#i-home"/></svg>Desa Makin Tertata</span>
          </div>
        </section>

        <div className="zk-grid-stats">
          <div className="zk-stat zk-stat--primary"><div className="zk-stat__icon"><svg className="zk-icon"><use href="#i-cam"/></svg></div><div><div className="zk-stat__label">Total Kamera</div><div className="zk-stat__value">{data.cameras.length}</div></div></div>
          <div className="zk-stat zk-stat--success"><div className="zk-stat__icon"><svg className="zk-icon"><use href="#i-radio"/></svg></div><div><div className="zk-stat__label">Online</div><div className="zk-stat__value">{data.cameras.length - protectedCount}</div></div></div>
          <div className="zk-stat zk-stat--danger"><div className="zk-stat__icon"><svg className="zk-icon"><use href="#i-radio"/></svg></div><div><div className="zk-stat__label">Perlu Kode</div><div className="zk-stat__value">{protectedCount}</div></div></div>
          <div className="zk-stat zk-stat--violet"><div className="zk-stat__icon"><svg className="zk-icon"><use href="#i-users"/></svg></div><div><div className="zk-stat__label">Total Cluster</div><div className="zk-stat__value">{data.clusters.length}</div></div></div>
          <div className="zk-stat zk-stat--status"><div style={{display:'flex',gap:'12px',alignItems:'center'}}><span className="zk-status-dot"></span><div><div className="zk-text-sm">Layanan ZKNet</div><div style={{color:'var(--zk-success)',fontWeight:700}}>Normal</div></div></div></div>
        </div>

        <div className="zk-grid-split">
          <div className="zk-stack">
            <section className="zk-panel">
              <div className="zk-panel__head"><h2 className="zk-h2"><svg className="zk-icon"><use href="#i-users"/></svg>Daftar Cluster</h2><a className="zk-link" href="#">Lihat Semua</a></div>
              <div className="zk-stack">
                {clusters.map((cluster) => (
                  <ClusterRow key={cluster.id} cluster={cluster} onOpen={() => (cluster.locked && !cluster.unlocked ? setUnlock(cluster) : nav(`/c/${cluster.slug}`))} />
                ))}
                {clusters.length === 0 && <p className="muted">Tidak ada cluster yang cocok dengan pencarian.</p>}
              </div>
            </section>
            <section className="zk-promo">
              <div><h3 className="zk-promo__title">Internet Stabil di Rumah &amp; Usaha?</h3><p className="zk-promo__sub">Pasang internet ZKNet sekarang!</p></div>
              <a className="zk-btn zk-btn--whatsapp" href="https://wa.me/6285640420791" target="_blank" rel="noreferrer">Hubungi Kami</a>
            </section>
          </div>

          <section className="zk-panel">
            <div className="zk-panel__head">
              <h2 className="zk-h2"><svg className="zk-icon"><use href="#i-video"/></svg>{featuredCluster ? featuredCluster.name : 'CCTV Publik'}</h2>
              <div className="zk-panel__tools">
                <div className="zk-segmented" role="group" aria-label="Tampilan">
                  <button aria-pressed="true" aria-label="Grid"><svg className="zk-icon"><use href="#i-grid"/></svg></button>
                  <button aria-pressed="false" aria-label="Daftar"><svg className="zk-icon"><use href="#i-list"/></svg></button>
                </div>
              </div>
            </div>
            <div className="zk-grid-cams" style={{'--zk-cols':3} as any}>
              {featuredCameras.map((camera) => <DashboardCameraCard key={camera.id} camera={camera} onOpen={() => nav(`/v/${camera.id}`)} />)}
              {featuredCameras.length === 0 && <p className="muted">Belum ada kamera untuk ditampilkan.</p>}
            </div>
          </section>
        </div>

        {loose.length > 0 && !featuredCluster && <section className="zk-panel"><h2>Kamera umum</h2><div className="zk-grid-cams" style={{'--zk-cols':4} as any}>{loose.map((camera) => <DashboardCameraCard key={camera.id} camera={camera} onOpen={() => nav(`/v/${camera.id}`)} />)}</div></section>}
      </main>

      {unlock && <UnlockDialog kind="cluster" id={unlock.id} title={unlock.name} onClose={() => setUnlock(null)} onUnlocked={() => { const slug = unlock.slug; setUnlock(null); reload(); nav(`/c/${slug}`) }} />}
    </div>
  )
}

function ClusterRow({ cluster, onOpen }: { cluster: Cluster; onOpen: () => void }) {
  const locked = cluster.locked && !cluster.unlocked
  return (
    <button className="zk-cluster-item" onClick={onOpen}>
      <div className="zk-cluster-item__icon"><svg className="zk-icon"><use href="#i-users"/></svg></div>
      <div className="zk-cluster-item__info">
        <div className="zk-cluster-item__name">{cluster.name}</div>
        <div className="zk-cluster-item__meta">{cluster.description || 'Kamera CCTV publik'} · {cluster.cameraCount} kamera</div>
      </div>
      <span className={`zk-badge ${locked ? 'zk-badge--warn' : 'zk-badge--success'}`}>{locked ? 'Berkode' : 'Online'}</span>
    </button>
  )
}

function DashboardCameraCard({ camera, onOpen }: { camera: Camera; onOpen: () => void }) {
  const locked = camera.locked && !camera.unlocked
  return (
    <div className="zk-card zk-cam-card" onClick={onOpen} style={{cursor: 'pointer'}}>
      <div className="zk-cam-card__thumb">
        <div className="zk-badge zk-badge--live">LIVE</div>
        {locked && <div className="zk-cam-card__lock"><svg className="zk-icon"><use href="#i-lock"/></svg></div>}
      </div>
      <div className="zk-cam-card__body">
        <div className="zk-cam-card__title">{camera.name}</div>
        <div className="zk-cam-card__loc">{camera.location}</div>
      </div>
    </div>
  )
}
