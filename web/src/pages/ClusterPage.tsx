import { useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import CameraTile from '../components/CameraTile'
import Player from '../components/Player'
import UnlockDialog from '../components/UnlockDialog'
import { useCatalog } from '../hooks'

export default function ClusterPage() {
  const { slug } = useParams()
  const { data, error, reload } = useCatalog()
  const nav = useNavigate()
  const [unlockCam, setUnlockCam] = useState<string | null>(null)
  const [wall, setWall] = useState(false)

  if (error) return <div className="page"><p className="error">{error}</p></div>
  if (!data) return <div className="page"><p className="muted">Memuat…</p></div>
  const cluster = data.clusters.find((c) => c.slug === slug)
  if (!cluster) return <div className="container page"><p>Cluster tidak ditemukan. <Link to="/">Kembali</Link></p></div>

  if (cluster.locked && !cluster.unlocked) {
    return (
      <UnlockDialog kind="cluster" id={cluster.id} title={cluster.name} onClose={() => nav('/')} onUnlocked={reload} />
    )
  }

  const cams = data.cameras.filter((c) => c.clusterId === cluster.id)
  const openCams = cams.filter((c) => !c.locked || c.unlocked).slice(0, 9)
  const lockedCam = cams.find((c) => c.id === unlockCam)

  return (
    <main className="container page">
      <nav className="crumbs"><Link to="/">← {data.site.site_title}</Link></nav>
      <div className="row between wrap">
        <div>
          <h1>{cluster.name}</h1>
          {cluster.description && <p className="muted">{cluster.description}</p>}
        </div>
        {openCams.length > 1 && (
          <button className="btn" onClick={() => setWall((w) => !w)}>{wall ? 'Tampilan daftar' : `Mode dinding (${openCams.length})`}</button>
        )}
      </div>

      {wall ? (
        <div className="wall">
          {openCams.map((c) => (
            <div key={c.id} className="wall-cell">
              <Player cameraId={c.id} compact />
              <Link className="wall-name" to={`/v/${c.id}`}>{c.name}</Link>
            </div>
          ))}
        </div>
      ) : cams.length ? (
        <div className="grid grid-tiles">
          {cams.map((c) => (
            <CameraTile key={c.id} cam={c} onOpen={() => (c.locked && !c.unlocked ? setUnlockCam(c.id) : nav(`/v/${c.id}`))} />
          ))}
        </div>
      ) : (
        <p className="muted">Belum ada kamera di cluster ini.</p>
      )}

      {lockedCam && (
        <UnlockDialog kind="camera" id={lockedCam.id} title={lockedCam.name} onClose={() => setUnlockCam(null)}
          onUnlocked={() => { setUnlockCam(null); reload(); nav(`/v/${lockedCam.id}`) }} />
      )}
    </main>
  )
}
