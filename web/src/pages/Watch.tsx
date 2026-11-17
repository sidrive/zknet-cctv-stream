import { useCallback, useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import AppShell from '../components/AppShell'
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

  if (error) return <AppShell title="Kamera"><p className="error">{error}</p></AppShell>
  if (!cam) return <AppShell title="Kamera"><p className="muted">Memuat…</p></AppShell>

  const target = need === 'cluster' && cam.cluster
    ? { kind: 'cluster' as const, id: cam.cluster.id, title: cam.cluster.name }
    : { kind: 'camera' as const, id: cam.id, title: cam.name }

  return (
    <AppShell
      title={cam.name}
      subtitle={[cam.location && `📍 ${cam.location}`, cam.description].filter(Boolean).join(' · ') || undefined}
    >
      <div className="zk-page">
        <nav className="zk-crumbs">
          {cam.cluster ? <Link className="zk-link" to={`/c/${cam.cluster.slug}`}>← {cam.cluster.name}</Link> : <Link className="zk-link" to="/">← Beranda</Link>}
        </nav>
        <Player key={version} cameraId={cam.id} onNeedUnlock={onNeedUnlock} />
      </div>
      {need && (
        <UnlockDialog {...target} onClose={() => setNeed(null)}
          onUnlocked={() => { setNeed(null); setVersion((v) => v + 1) }} />
      )}
    </AppShell>
  )
}
