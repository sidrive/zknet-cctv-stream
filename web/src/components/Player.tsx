import { useCallback, useEffect, useRef, useState } from 'react'
import type HlsType from 'hls.js'
import { api, ApiError, type Session } from '../api'

interface Props {
  cameraId: string
  /** dipanggil saat server minta kode akses (grant belum ada / kedaluwarsa) */
  onNeedUnlock?: (need: 'cluster' | 'camera') => void
  compact?: boolean
}

type State = 'loading' | 'live' | 'error'

export default function Player({ cameraId, onNeedUnlock, compact }: Props) {
  const videoRef = useRef<HTMLVideoElement>(null)
  const boxRef = useRef<HTMLDivElement>(null)
  const [session, setSession] = useState<Session | null>(null)
  const [state, setState] = useState<State>('loading')
  const [message, setMessage] = useState('')
  const [nonce, setNonce] = useState(0)
  const needUnlock = useRef(onNeedUnlock)
  needUnlock.current = onNeedUnlock

  const retry = useCallback(() => setNonce((n) => n + 1), [])

  // 1) minta sesi tonton dari server
  useEffect(() => {
    let cancelled = false
    setState('loading')
    setSession(null)
    api.session(cameraId)
      .then((s) => !cancelled && setSession(s))
      .catch((e) => {
        if (cancelled) return
        if (e instanceof ApiError && e.status === 403 && e.body?.need) {
          needUnlock.current?.(e.body.need)
        }
        setMessage(e instanceof ApiError ? e.message : 'Gagal memuat kamera')
        setState('error')
      })
    return () => { cancelled = true }
  }, [cameraId, nonce])

  // 2) putar HLS via hls.js (dimuat lazy) atau native di Safari/iOS
  useEffect(() => {
    if (!session || session.type !== 'hls') return
    const video = videoRef.current
    if (!video) return
    let hls: HlsType | null = null
    let cancelled = false
    let retries = 0
    const onPlaying = () => setState('live')
    video.addEventListener('playing', onPlaying)
    const fail = (m: string) => { setMessage(m); setState('error') }

    ;(async () => {
      const { default: Hls } = await import('hls.js')
      if (cancelled) return
      if (Hls.isSupported()) {
        hls = new Hls({ lowLatencyMode: true, liveSyncDurationCount: 3, maxBufferLength: 10 })
        hls.loadSource(session.url)
        hls.attachMedia(video)
        hls.on(Hls.Events.ERROR, (_e, d) => {
          if (!d.fatal) return
          // Sumber putus sesaat: coba pulihkan beberapa kali sebelum menyerah.
          if (d.type === Hls.ErrorTypes.NETWORK_ERROR && retries < 3) {
            retries++
            setTimeout(() => hls?.startLoad(), 1500 * retries)
          } else if (d.type === Hls.ErrorTypes.MEDIA_ERROR && retries < 3) {
            retries++
            hls?.recoverMediaError()
          } else fail('Stream terputus atau kamera offline')
        })
      } else if (video.canPlayType('application/vnd.apple.mpegurl')) {
        video.src = session.url
        video.addEventListener('error', () => fail('Stream tidak dapat diputar'), { once: true })
      } else fail('Browser tidak mendukung HLS')
      video.play().catch(() => undefined)
    })().catch(() => fail('Gagal memuat pemutar'))

    return () => {
      cancelled = true
      video.removeEventListener('playing', onPlaying)
      hls?.destroy()
      video.removeAttribute('src')
      video.load()
    }
  }, [session])

  // 3) MJPEG / embed dianggap live saat elemennya memuat
  const fullscreen = () => {
    const el = boxRef.current
    if (!el) return
    if (document.fullscreenElement) document.exitFullscreen()
    else el.requestFullscreen?.().catch(() => undefined)
  }

  return (
    <div className={`player ${compact ? 'player-compact' : ''}`} ref={boxRef}>
      {session?.type === 'hls' && <video ref={videoRef} muted playsInline autoPlay controls={!compact} />}
      {session?.type === 'mjpeg' && (
        <img src={session.url} alt="" onLoad={() => setState('live')} onError={() => { setMessage('Stream tidak dapat dimuat'); setState('error') }} />
      )}
      {session?.type === 'embed' && (
        <iframe src={session.url} title="Kamera" allow="autoplay; fullscreen" allowFullScreen onLoad={() => setState('live')} />
      )}
      {state === 'loading' && <div className="player-overlay"><span className="spinner" />Menghubungkan…</div>}
      {state === 'error' && (
        <div className="player-overlay">
          <span className="muted">{message}</span>
          <button className="btn btn-sm" onClick={retry}>Coba lagi</button>
        </div>
      )}
      {state === 'live' && <span className="badge-live">LIVE</span>}
      {!compact && state === 'live' && (
        <button className="player-fs" onClick={fullscreen} aria-label="Layar penuh" title="Layar penuh">⛶</button>
      )}
    </div>
  )
}
