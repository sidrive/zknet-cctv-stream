import { useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import CameraTile from '../components/CameraTile'
import UnlockDialog from '../components/UnlockDialog'
import { useCatalog } from '../hooks'
import type { Camera, Cluster } from '../api'

const icon = {
  dashboard: '⌂',
  cameras: '▣',
  cluster: '♧',
  map: '⌖',
  network: '▥',
  settings: '⚙',
}

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
    <div className="dashboard-shell">
      <aside className="dashboard-sidebar" aria-label="Navigasi utama">
        <Link className="brand-mark" to="/" aria-label={`${data.site.site_title}, beranda`}>
          <img src="/zknet-logo.png" alt="zknet Internet untuk Desa" />
        </Link>

        <nav className="dashboard-nav">
          <a className="dashboard-nav-item active" href="#dashboard"><span aria-hidden>{icon.dashboard}</span>Dashboard</a>
          <a className="dashboard-nav-item" href="#cctv-publik"><span aria-hidden>{icon.cameras}</span>CCTV Publik</a>
          <a className="dashboard-nav-item" href="#cluster"><span aria-hidden>{icon.cluster}</span>Cluster</a>
          <a className="dashboard-nav-item" href="#cctv-publik"><span aria-hidden>{icon.map}</span>Peta Lokasi</a>
          <a className="dashboard-nav-item" href="#status"><span aria-hidden>{icon.network}</span>Status Jaringan</a>
          <Link className="dashboard-nav-item" to="/admin"><span aria-hidden>{icon.settings}</span>Pengaturan</Link>
        </nav>
      </aside>

      <main className="dashboard-main" id="dashboard">
        <header className="dashboard-topbar">
          <div className="dashboard-title">
            <span className="dashboard-title-icon" aria-hidden>◒</span>
            <div><strong>ZKNet CCTV</strong><span>Pemantauan kamera CCTV publik di wilayah layanan ZKNet.</span></div>
          </div>
          <div className="dashboard-actions">
            <label className="dashboard-search">
              <span aria-hidden>⌕</span>
              <input type="search" placeholder="Cari kamera, lokasi, atau cluster…" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Cari kamera, lokasi, atau cluster" />
              <kbd>⌘ K</kbd>
            </label>
            <button className="icon-button notification-button" aria-label="Notifikasi">♧<i /></button>
            <span className="profile-avatar" aria-label="Profil pengguna">●</span>
          </div>
        </header>

        <div className="dashboard-content">
          <section className="dashboard-hero" aria-labelledby="hero-title">
            <div className="hero-copy">
              <span className="eyebrow">LAYANAN PEMANTAUAN LINGKUNGAN</span>
              <h1 id="hero-title">Pantau Lingkungan Desa<br />Lebih Aman dan Nyaman</h1>
              <p>CCTV publik untuk keamanan, ketertiban,<br />dan kenyamanan bersama.</p>
              <div className="hero-pills" aria-label="Manfaat layanan">
                <span>♢ <b>Keamanan Lingkungan</b></span>
                <span>♧ <b>Kenyamanan Warga</b></span>
                <span>♧ <b>Desa Makin Tertata</b></span>
              </div>
            </div>
            <div className="hero-illustration" aria-hidden><span className="hero-camera">◉</span><span className="hero-pole" /></div>
          </section>

          <section className="stats-grid" aria-label="Ringkasan kamera">
            <StatTile icon="▱" label="Total Kamera" value={data.cameras.length} tone="blue" />
            <StatTile icon="◉" label="Kamera Publik" value={data.cameras.length - protectedCount} tone="green" />
            <StatTile icon="♙" label="Perlu Kode" value={protectedCount} tone="red" />
            <StatTile icon="♧" label="Total Cluster" value={data.clusters.length} tone="purple" />
            <div className="service-status" id="status"><span className="status-dot" /><div><span>Layanan ZKNet</span><strong>Normal</strong></div><span className="signal-bars" aria-hidden>▂▅▇</span></div>
          </section>

          <div className="dashboard-grid">
            <section className="cluster-panel" id="cluster" aria-labelledby="cluster-title">
              <div className="section-heading"><h2 id="cluster-title">♧ &nbsp;Daftar Cluster</h2><span className="section-link">Lihat Semua →</span></div>
              <div className="cluster-list">
                {clusters.map((cluster) => (
                  <ClusterRow key={cluster.id} cluster={cluster} onOpen={() => (cluster.locked && !cluster.unlocked ? setUnlock(cluster) : nav(`/c/${cluster.slug}`))} />
                ))}
                {clusters.length === 0 && <p className="muted">Tidak ada cluster yang cocok dengan pencarian.</p>}
              </div>
              <div className="small-promo"><span className="small-promo-art" aria-hidden>⌁</span><div><strong>Internet Stabil<br />di Rumah &amp; Usaha?</strong><span>Pasang internet ZKNet sekarang!</span></div><a href="https://wa.me/6285640420791" target="_blank" rel="noreferrer">Hubungi Kami<br /><b>085640420791</b></a></div>
            </section>

            <section className="camera-panel" id="cctv-publik" aria-labelledby="camera-title">
              <div className="section-heading camera-heading"><h2 id="camera-title">▣ &nbsp;{featuredCluster ? featuredCluster.name : 'CCTV Publik'}</h2><div className="view-controls"><button className="view-button active" aria-label="Tampilan grid">▦</button><button className="view-button" aria-label="Tampilan daftar">☷</button><span className="view-select">Tampilan 3 × 3⌄</span></div></div>
              {featuredCameras.length ? <div className="camera-dashboard-grid">{featuredCameras.map((camera) => <DashboardCameraCard key={camera.id} camera={camera} onOpen={() => nav(`/v/${camera.id}`)} />)}</div> : <p className="muted">Belum ada kamera untuk ditampilkan.</p>}
            </section>
          </div>

          {loose.length > 0 && !featuredCluster && <section className="fallback-camera-list"><h2>Kamera umum</h2><div className="grid grid-tiles">{loose.map((camera) => <CameraTile key={camera.id} cam={camera} onOpen={() => nav(`/v/${camera.id}`)} />)}</div></section>}
        </div>
      </main>

      {unlock && <UnlockDialog kind="cluster" id={unlock.id} title={unlock.name} onClose={() => setUnlock(null)} onUnlocked={() => { const slug = unlock.slug; setUnlock(null); reload(); nav(`/c/${slug}`) }} />}
    </div>
  )
}

function StatTile({ icon: tileIcon, label, value, tone }: { icon: string; label: string; value: number; tone: string }) {
  return <div className={`stat-tile stat-${tone}`}><span className="stat-icon" aria-hidden>{tileIcon}</span><div><span>{label}</span><strong>{value}</strong></div></div>
}

function ClusterRow({ cluster, onOpen }: { cluster: Cluster; onOpen: () => void }) {
  const locked = cluster.locked && !cluster.unlocked
  return <button className="cluster-row" onClick={onOpen}><span className="cluster-thumb" aria-hidden>{cluster.name.slice(0, 1)}</span><span className="cluster-details"><strong>{cluster.name}</strong><span>{cluster.description || 'Kamera CCTV publik'}</span><small>{cluster.cameraCount} kamera</small></span><span className={`access-badge ${locked ? 'locked' : 'online'}`}>{locked ? '▣ Berkode' : '● Online'}</span><span className="row-arrow" aria-hidden>›</span></button>
}

function DashboardCameraCard({ camera, onOpen }: { camera: Camera; onOpen: () => void }) {
  const locked = camera.locked && !camera.unlocked
  return <button className="dashboard-camera-card" onClick={onOpen}><span className="camera-art" aria-hidden><span className="live-badge">LIVE</span><span className="camera-art-lines" /></span><span className="camera-card-label"><span>▣</span>{camera.name}<small>{camera.location}</small></span>{locked && <span className="camera-lock">▣</span>}</button>
}
