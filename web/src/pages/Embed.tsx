import { useCallback, useEffect, useRef, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import CameraTile from '../components/CameraTile'
import Player from '../components/Player'
import UnlockDialog from '../components/UnlockDialog'
import { setGrant, type Camera } from '../api'
import { useCatalog } from '../hooks'

const post = (msg: Record<string, unknown>) => {
  if (window.parent !== window) window.parent.postMessage({ ...msg }, '*')
}

/**
 * Mode mini-app: tanpa header/footer, bisa difilter ke satu cluster/kamera, tema ikut host.
 * Kontrak postMessage ke host: zknet-cctv:ready | :resize {height} | :camera {id,name}
 */
export default function Embed() {
  const [params] = useSearchParams()
  const clusterSlug = params.get('cluster')
  const cameraParam = params.get('camera')
  const hostGrant = params.get('grant')
  const theme = params.get('theme')
  const { data, error, reload } = useCatalog()
  const [selected, setSelected] = useState<string | null>(cameraParam)
  const [unlock, setUnlock] = useState<{ kind: 'cluster' | 'camera'; id: string; title: string; then?: string } | null>(null)
  const rootRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (hostGrant) { setGrant(hostGrant); reload() }
  }, [hostGrant, reload])

  useEffect(() => {
    if (theme === 'light' || theme === 'dark') document.documentElement.dataset.theme = theme
    post({ type: 'zknet-cctv:ready' })
  }, [theme])

  useEffect(() => {
    const el = rootRef.current
    if (!el) return
    const ro = new ResizeObserver(() => post({ type: 'zknet-cctv:resize', height: Math.ceil(el.getBoundingClientRect().height) }))
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  const select = useCallback((c: Camera) => {
    if (c.locked && !c.unlocked) setUnlock({ kind: 'camera', id: c.id, title: c.name, then: c.id })
    else { setSelected(c.id); post({ type: 'zknet-cctv:camera', id: c.id, name: c.name }) }
  }, [])

  if (error) return <div className="embed" ref={rootRef}><p className="error">{error}</p></div>
  if (!data) return <div className="embed" ref={rootRef}><p className="muted">Memuat…</p></div>

  const cluster = clusterSlug ? data.clusters.find((c) => c.slug === clusterSlug) : undefined
  const cams = data.cameras.filter((c) => (cluster ? c.clusterId === cluster.id : !clusterSlug))
  const cam = selected ? (data.cameras.find((c) => c.id === selected) ?? { id: selected, name: '' } as Camera) : null
  const gate = cluster && cluster.locked && !cluster.unlocked

  return (
    <div className="embed" ref={rootRef}>
      {clusterSlug && !cluster && <p className="error">Cluster tidak ditemukan.</p>}

      {cam ? (
        <>
          {!cameraParam && <button className="btn btn-sm btn-ghost" onClick={() => setSelected(null)}>← Semua kamera</button>}
          {cam.name && <h2 className="embed-title">{cam.name}</h2>}
          <Player cameraId={cam.id} onNeedUnlock={(need) => {
            if (need === 'cluster' && cluster) setUnlock({ kind: 'cluster', id: cluster.id, title: cluster.name })
            else setUnlock({ kind: 'camera', id: cam.id, title: cam.name || 'Kamera' })
          }} />
        </>
      ) : gate ? (
        <div className="card">
          <strong>🔒 {cluster!.name}</strong>
          <p className="muted">Cluster ini membutuhkan kode akses.</p>
          <button className="btn btn-primary" onClick={() => setUnlock({ kind: 'cluster', id: cluster!.id, title: cluster!.name })}>Masukkan kode</button>
        </div>
      ) : (
        <>
          {cluster && <h2 className="embed-title">{cluster.name}</h2>}
          {cams.length === 0 && !clusterSlug && data.clusters.length > 0 && (
            <div className="grid">
              {data.clusters.map((c) => (
                <a key={c.id} className="card card-click" href={`?cluster=${c.slug}${hostGrant ? `&grant=${encodeURIComponent(hostGrant)}` : ''}`}>
                  <strong>{c.name}</strong><span className="muted small">{c.cameraCount} kamera</span>
                </a>
              ))}
            </div>
          )}
          <div className="grid grid-tiles">
            {cams.map((c) => <CameraTile key={c.id} cam={c} onOpen={() => select(c)} />)}
          </div>
          {cams.length === 0 && (clusterSlug || data.clusters.length === 0) && <p className="muted">Tidak ada kamera.</p>}
        </>
      )}

      {unlock && (
        <UnlockDialog kind={unlock.kind} id={unlock.id} title={unlock.title} onClose={() => setUnlock(null)}
          onUnlocked={() => { const t = unlock.then; setUnlock(null); reload(); if (t) setSelected(t); else setSelected((s) => s) }} />
      )}
    </div>
  )
}
