import { lazy, Suspense } from 'react'
import { Link, Route, Routes, useLocation } from 'react-router-dom'
import Home from './pages/Home'
import ClusterPage from './pages/ClusterPage'
import Watch from './pages/Watch'
import Embed from './pages/Embed'
import Status from './pages/Status'
import Clusters from './pages/Clusters'
const Admin = lazy(() => import('./pages/Admin'))
// MapLibre besar (~1 MB); dimuat hanya saat halaman peta dibuka.
const MapPage = lazy(() => import('./pages/MapPage'))

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<Home />} />
      <Route path="/c/:slug" element={<ClusterPage />} />
      <Route path="/v/:id" element={<Watch />} />
      <Route path="/status" element={<Status />} />
      <Route path="/cluster" element={<Clusters />} />
      <Route path="/peta" element={<Suspense fallback={<div className="zk-app zk-app--plain"><main className="zk-main"><p className="muted">Memuat peta…</p></main></div>}><MapPage /></Suspense>} />
      <Route path="/embed" element={<Embed />} />
      <Route path="/admin/*" element={<Suspense fallback={null}><Admin /></Suspense>} />
      <Route path="*" element={<NotFound />} />
    </Routes>
  )
}

/**
 * Halaman 404. Server sudah membalas status 404 untuk URL tak dikenal
 * (lihat server/src/index.ts), jadi halaman ini tidak lagi tampil sebagai
 * "sehat" di log — dan pengunjung tetap diberi jalan kembali.
 */
function NotFound() {
  const { pathname } = useLocation()
  return (
    <div className="zk-app zk-app--plain">
      <main className="zk-main">
        <div className="zk-page">
          <nav className="zk-crumbs"><Link to="/" className="zk-link">← Beranda</Link></nav>
          <h1 className="zk-h2" style={{ marginBottom: '0.5rem' }}>Halaman tidak ditemukan</h1>
          <p className="zk-text-sm zk-muted" style={{ marginBottom: '1rem' }}>
            Alamat <code>{pathname}</code> tidak ada di aplikasi ini. Mungkin tautannya sudah berubah.
          </p>
          <p style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
            <Link className="zk-btn zk-btn--primary zk-btn--sm" to="/">Ke Beranda</Link>
            <Link className="zk-btn zk-btn--ghost zk-btn--sm" to="/cluster">Lihat Cluster</Link>
            <Link className="zk-btn zk-btn--ghost zk-btn--sm" to="/peta">Buka Peta</Link>
          </p>
        </div>
      </main>
    </div>
  )
}
