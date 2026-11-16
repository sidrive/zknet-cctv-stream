import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { api, ApiError, type HealthDetail } from '../api'
import { formatChecked } from '../status'

const errMsg = (e: unknown) => (e instanceof ApiError ? e.message : 'Terjadi kesalahan')

export default function Status() {
  const [h, setH] = useState<HealthDetail | null>(null)
  const [error, setError] = useState('')
  const [refreshing, setRefreshing] = useState(false)
  const load = useCallback(() => {
    api.health().then(setH).catch((e) => setError(errMsg(e)))
  }, [])
  useEffect(() => { load(); document.title = 'Status Jaringan — ZKNet' }, [load])

  const refresh = async () => {
    setRefreshing(true)
    try {
      await api.refreshHealth()
      load()
    } catch (e) { setError(errMsg(e)) } finally { setRefreshing(false) }
  }

  if (error) return <div className="zk-app zk-app--plain"><main className="zk-main"><div className="container page"><p className="error">{error}</p><Link to="/">← Kembali</Link></div></main></div>
  if (!h) return <div className="zk-app zk-app--plain"><main className="zk-main"><div className="container page"><p className="muted">Memuat…</p></div></main></div>

  const c = h.cameras
  const pct = (n: number, d: number) => (d ? Math.round((n / d) * 100) : 0)

  return (
    <div className="zk-app zk-app--plain">
      <main className="zk-main">
        <div className="zk-page">
          <nav className="zk-crumbs"><Link to="/" className="zk-link">← Beranda</Link></nav>
          <div className="zk-panel__head" style={{ marginBottom: '1.25rem' }}>
            <h1 className="zk-h2"><svg className="zk-icon"><use href="#i-signal" /></svg> Status Jaringan</h1>
          </div>

          <div className="zk-grid-stats" style={{ marginBottom: '1.25rem' }}>
            <div className={`zk-stat ${h.ok ? 'zk-stat--success' : 'zk-stat--danger'}`}><div className="zk-stat__icon"><svg className="zk-icon"><use href="#i-signal" /></svg></div><div><div className="zk-stat__label">Layanan ZKNet</div><div className="zk-stat__value">{h.ok ? 'Normal' : 'Ada Gangguan'}</div></div></div>
            <div className="zk-stat zk-stat--primary"><div className="zk-stat__icon"><svg className="zk-icon"><use href="#i-cam" /></svg></div><div><div className="zk-stat__label">Kamera aktif</div><div className="zk-stat__value">{c.enabled}<span className="zk-stat__unit">/{c.total}</span></div></div></div>
            <div className="zk-stat zk-stat--success"><div className="zk-stat__icon"><svg className="zk-icon"><use href="#i-check" /></svg></div><div><div className="zk-stat__label">Online</div><div className="zk-stat__value">{c.online}<span className="zk-stat__unit"> · {pct(c.online, c.enabled)}%</span></div></div></div>
            <div className="zk-stat zk-stat--danger"><div className="zk-stat__icon"><svg className="zk-icon"><use href="#i-radio" /></svg></div><div><div className="zk-stat__label">Offline</div><div className="zk-stat__value">{c.offline}</div></div></div>
            <div className="zk-stat zk-stat--violet"><div className="zk-stat__icon"><svg className="zk-icon"><use href="#i-radio" /></svg></div><div><div className="zk-stat__label">Belum dicek</div><div className="zk-stat__value">{c.unknown}</div></div></div>
          </div>

          <div className="zk-panel" style={{ marginBottom: '1rem' }}>
            <div className="zk-panel__head">
              <h2 className="zk-h2"><svg className="zk-icon"><use href="#i-radio" /></svg> Kamera Bermasalah</h2>
              <div className="zk-panel__tools">
                <span className="zk-text-sm" style={{ color: 'var(--zk-muted)', marginRight: '0.5rem' }}>Cek terakhir: {formatChecked(h.lastCheckAt)}</span>
                <button className="zk-btn zk-btn--sm" onClick={refresh} disabled={refreshing}>{refreshing ? 'Memeriksa…' : 'Cek ulang'}</button>
              </div>
            </div>
            {h.problems.length === 0 ? (
              <p className="zk-text-sm" style={{ color: 'var(--zk-muted)', padding: '0.75rem 0' }}>
                {c.offline === 0 && c.unknown === 0 ? 'Semua kamera merespons dengan baik.' : 'Belum ada kamera yang terdeteksi offline.'}
              </p>
            ) : (
              <div className="zk-cams-list">
                {h.problems.map((p) => (
                  <Link key={p.id} className="zk-cam-row" to={`/v/${p.id}`}>
                    <div className="zk-cam-row__info">
                      <svg className="zk-icon" style={{ width: 20, height: 20, color: 'var(--zk-danger)', flexShrink: 0 }}><use href="#i-radio" /></svg>
                      <div style={{ minWidth: 0 }}>
                        <div className="zk-cam-row__name">{p.name}</div>
                        <div className="zk-cam-row__loc">Offline · dicek {formatChecked(p.checkedAt)}</div>
                      </div>
                    </div>
                    <span className="zk-badge zk-badge--offline">Offline</span>
                  </Link>
                ))}
              </div>
            )}
          </div>

          <div className="zk-panel">
            <h2 className="zk-h2" style={{ marginBottom: '0.5rem' }}><svg className="zk-icon"><use href="#i-radio" /></svg> Detail</h2>
            <dl className="zk-dl">
              <div><dt>Uptime server</dt><dd>{Math.floor(h.uptimeSeconds / 60)} menit</dd></div>
              <div><dt>Cluster</dt><dd>{h.clusters}</dd></div>
              <div><dt>Transcoder ffmpeg aktif</dt><dd>{h.transcoders}</dd></div>
              <div><dt>Kamera (total / aktif)</dt><dd>{c.total} / {c.enabled}</dd></div>
            </dl>
            <p className="zk-text-sm" style={{ color: 'var(--zk-muted)' }}>Status dihitung server dengan mengetes sumber tiap kamera (berjalan otomatis tiap 60 detik). Butuh waktu beberapa saat setelah server menyala untuk kamera pertama kali dicek.</p>
          </div>
        </div>
      </main>
    </div>
  )
}