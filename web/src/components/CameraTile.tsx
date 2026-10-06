import type { Camera } from '../api'

const TYPE_LABEL: Record<string, string> = { hls: 'HLS', mjpeg: 'MJPEG', rtsp: 'RTSP', embed: 'Embed' }

export default function CameraTile({ cam, onOpen }: { cam: Camera; onOpen: () => void }) {
  const locked = cam.locked && !cam.unlocked
  return (
    <button className="tile" onClick={onOpen}>
      <div className="tile-thumb" aria-hidden>
        <span className="tile-icon">{locked ? '🔒' : '▶'}</span>
      </div>
      <div className="tile-body">
        <strong>{cam.name}</strong>
        {cam.location && <span className="muted small">📍 {cam.location}</span>}
        <div className="row gap-s">
          <span className={`chip ${cam.locked ? 'chip-lock' : 'chip-free'}`}>{cam.locked ? (cam.unlocked ? 'Terbuka' : 'Berkode') : 'Gratis'}</span>
          <span className="chip">{TYPE_LABEL[cam.type] ?? cam.type}</span>
        </div>
      </div>
    </button>
  )
}
