import { useCallback, useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import Player from '../components/Player'
import UnlockDialog from '../components/UnlockDialog'
import { api, ApiError, type CameraDetail } from '../api'

export default function Watch() {
  const { id = '' } = useParams()
  const [cam, setCam] = useState<CameraDetail | null>(null)
  const [error, setError] = useState('')
  const [need, setNeed] = useState<'cluster' | 'camera' | null>(null)
  const [version, setVersion] = useState(0)

  useEffect(() => {
    api.camera(id).then((c) => { setCam(c); document.title = c.name }).catch((e) => setError(e instanceof ApiError ? e.message : 'Gagal'))
  }, [id, version])

  const onNeedUnlock = useCallback((n: 'cluster' | 'camera') => setNeed(n), [])

  if (error) return <div className="container page"><p className="error">{error}</p><Link to="/">Kembali</Link></div>
  if (!cam) return <div className="container page"><p className="muted">Memuat…</p></div>

  const target = need === 'cluster' && cam.cluster
    ? { kind: 'cluster' as const, id: cam.cluster.id, title: cam.cluster.name }
    : { kind: 'camera' as const, id: cam.id, title: cam.name }

  return (
    <main className="container page">
      <nav className="crumbs">
        {cam.cluster ? <Link to={`/c/${cam.cluster.slug}`}>← {cam.cluster.name}</Link> : <Link to="/">← Beranda</Link>}
      </nav>
      <h1>{cam.name}</h1>
      <p className="muted">{[cam.location && `📍 ${cam.location}`, cam.description].filter(Boolean).join(' · ')}</p>
      <Player key={version} cameraId={cam.id} onNeedUnlock={onNeedUnlock} />
      {need && (
        <UnlockDialog {...target} onClose={() => setNeed(null)}
          onUnlocked={() => { setNeed(null); setVersion((v) => v + 1) }} />
      )}
    </main>
  )
}
