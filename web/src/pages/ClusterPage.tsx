import { useState } from 'react'
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom'
import CameraTile from '../components/CameraTile'
import Player from '../components/Player'
import UnlockDialog from '../components/UnlockDialog'
import { useCatalog } from '../hooks'

/**
 * Mode dinding: beberapa stream sekaligus dalam satu grid.
 *
 * Pilihan grid dan nomor halaman disimpan di URL (`?wall=3x3&page=2`) supaya
 * tidak hilang saat refresh, tombol back, atau saat tautan dibagikan ke petugas
 * lain. Hanya kamera pada halaman aktif yang dimuat, jadi cluster berisi 108
 * kamera tidak membuka 108 stream sekaligus.
 */
const WALL_SIZES = ['2x2', '3x3', '4x4'] as const
type WallSize = (typeof WALL_SIZES)[number]

const perPage = (size: WallSize) => Number(size[0]) * Number(size[2])
const colsOf = (size: WallSize) => Number(size[0])

export default function ClusterPage() {
  const { slug } = useParams()
  const { data, error, reload } = useCatalog()
  const nav = useNavigate()
  const [unlockCam, setUnlockCam] = useState<string | null>(null)
  // Dibaca langsung dari URL, jadi kondisi "mode dinding" tidak pernah basi.
  const [params, setParams] = useSearchParams()

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
  const openCams = cams.filter((c) => !c.locked || c.unlocked)
  const lockedCount = cams.length - openCams.length

  const rawWall = params.get('wall')
  // Di ponsel, 3×3 membuat tiap sel ~110 px sehingga teksnya tidak terbaca.
  // Default 2×2 untuk layar sempit; pilihan pengguna di URL tetap dihormati.
  const defaultSize: WallSize = typeof window !== 'undefined' && window.innerWidth < 700 ? '2x2' : '3x3'
  const size: WallSize = WALL_SIZES.includes(rawWall as WallSize) ? (rawWall as WallSize) : defaultSize
  const tooDense = colsOf(size) > 2 && typeof window !== 'undefined' && window.innerWidth < 700
  const wall = rawWall !== null
  const per = perPage(size)
  const totalPages = Math.max(1, Math.ceil(openCams.length / per))
  const wanted = Math.max(1, Number.parseInt(params.get('page') ?? '1', 10) || 1)
  // Halaman di luar jangkauan (mis. setelah kamera dihapus) dijepit, bukan error.
  const page = Math.min(wanted, totalPages)
  const start = (page - 1) * per
  const visible = openCams.slice(start, start + per)

  /** Mengubah URL adalah satu-satunya cara mengubah mode, agar state selalu bisa di-share. */
  const go = (next: { wall?: WallSize | null; page?: number }) => {
    const p = new URLSearchParams(params)
    if (next.wall !== undefined) {
      if (next.wall === null) { p.delete('wall'); p.delete('page') }
      else { p.set('wall', next.wall); p.delete('page') }
    }
    if (next.page !== undefined) {
      if (next.page <= 1) p.delete('page')
      else p.set('page', String(next.page))
    }
    setParams(p)
  }

  const lockedCam = cams.find((c) => c.id === unlockCam)

  return (
    <main className="container page">
      <nav className="crumbs"><Link to="/">← {data.site.site_title}</Link></nav>
      <div className="row between wrap">
        <div>
          <h1>{cluster.name}</h1>
          {cluster.description && <p className="muted">{cluster.description}</p>}
          <p className="muted small" style={{ margin: 0 }}>
            {openCams.length} dari {cams.length} kamera bisa ditonton
            {lockedCount > 0 ? ` · ${lockedCount} perlu kode` : ''}
          </p>
        </div>
        {openCams.length > 1 && (
          <button className="btn" onClick={() => go({ wall: wall ? null : size })}>
            {wall ? 'Tampilan daftar' : 'Mode dinding'}
          </button>
        )}
      </div>

      {wall ? (
        <>
          <div className="wall-tools">
            <span className="wall-tools__label">Ukuran</span>
            {WALL_SIZES.map((s) => (
              <button
                key={s}
                className={`btn btn-sm${s === size ? ' btn-primary' : ''}`}
                aria-pressed={s === size}
                onClick={() => go({ wall: s })}
              >
                {s.replace('x', ' × ')}
              </button>
            ))}
            {totalPages > 1 && (
              <span className="wall-tools__pages">
                <button className="btn btn-sm" onClick={() => go({ page: page - 1 })} disabled={page <= 1} aria-label="Halaman sebelumnya">←</button>
                <span className="muted small">Halaman {page} / {totalPages}</span>
                <button className="btn btn-sm" onClick={() => go({ page: page + 1 })} disabled={page >= totalPages} aria-label="Halaman berikutnya">→</button>
              </span>
            )}
            <span className="muted small">
              menampilkan {start + 1}–{Math.min(start + per, openCams.length)} dari {openCams.length}
            </span>
            {tooDense && <span className="muted small wall-tools__hint">Layar kecil: 2 × 2 paling nyaman.</span>}
          </div>

          <div className="wall" style={{ gridTemplateColumns: `repeat(${colsOf(size)}, minmax(0, 1fr))` }}>
            {visible.map((c) => (
              <div key={c.id} className="wall-cell">
                <Player cameraId={c.id} compact />
                <Link className="wall-name" to={`/v/${c.id}`}>{c.name}</Link>
              </div>
            ))}
          </div>
        </>
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
