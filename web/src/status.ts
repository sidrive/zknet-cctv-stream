import type { CameraStatus } from './api'

export const STATUS_LABEL: Record<CameraStatus, string> = {
  online: 'Online',
  offline: 'Offline',
  unknown: 'Belum dicek',
}

export const STATUS_BADGE: Record<CameraStatus, string> = {
  online: 'zk-badge--online',
  offline: 'zk-badge--offline',
  unknown: 'zk-badge--info',
}

/** Kamera berkode tetap boleh tampil "Berkode", tapi status sumbernya tetap dihormati. */
export function cameraBadge(cam: { locked: boolean; unlocked: boolean; status?: CameraStatus }) {
  const locked = cam.locked && !cam.unlocked
  if (locked) return { cls: 'zk-badge--locked', text: 'Berkode' }
  const s: CameraStatus = cam.status ?? 'unknown'
  return { cls: STATUS_BADGE[s], text: s === 'online' ? 'LIVE' : STATUS_LABEL[s] }
}

export const formatChecked = (ts: number | null) =>
  ts ? new Date(ts).toLocaleString('id-ID', { dateStyle: 'short', timeStyle: 'short' }) : 'belum pernah'
