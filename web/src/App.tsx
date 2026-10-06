import { lazy, Suspense } from 'react'
import { Route, Routes } from 'react-router-dom'
import Home from './pages/Home'
import ClusterPage from './pages/ClusterPage'
import Watch from './pages/Watch'
import Embed from './pages/Embed'
const Admin = lazy(() => import('./pages/Admin'))

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<Home />} />
      <Route path="/c/:slug" element={<ClusterPage />} />
      <Route path="/v/:id" element={<Watch />} />
      <Route path="/embed" element={<Embed />} />
      <Route path="/admin/*" element={<Suspense fallback={null}><Admin /></Suspense>} />
      <Route path="*" element={<div className="container page"><p>Halaman tidak ditemukan.</p></div>} />
    </Routes>
  )
}
