export class ApiError extends Error {
  constructor(public status: number, message: string, public body?: any) {
    super(message)
  }
}

const GRANT_KEY = 'zk_grant'
export const getGrant = () => {
  try { return localStorage.getItem(GRANT_KEY) || '' } catch { return '' }
}
export const setGrant = (g: string) => {
  try { localStorage.setItem(GRANT_KEY, g) } catch { /* storage diblokir: grant hanya di memori */ }
  memoryGrant = g
}
let memoryGrant = ''
const currentGrant = () => getGrant() || memoryGrant

async function req<T>(method: string, path: string, body?: unknown): Promise<T> {
  const headers: Record<string, string> = {}
  if (method !== 'GET') headers['content-type'] = 'application/json'
  const g = currentGrant()
  if (g) headers['x-grant'] = g
  const res = await fetch(path, {
    method,
    headers,
    credentials: 'same-origin',
    body: method === 'GET' ? undefined : JSON.stringify(body ?? {}),
  })
  const data = await res.json().catch(() => ({}))
  if (!res.ok) throw new ApiError(res.status, data?.error || `Error ${res.status}`, data)
  return data as T
}

export interface Site { site_title: string; site_description: string }
export interface Cluster { id: string; slug: string; name: string; description: string; locked: boolean; unlocked: boolean; cameraCount: number }
export interface Camera { id: string; name: string; description: string; location: string; clusterId: string | null; type: string; locked: boolean; unlocked: boolean }
export interface Catalog { site: Site; clusters: Cluster[]; cameras: Camera[] }
export interface CameraDetail extends Omit<Camera, 'clusterId'> {
  cluster: { id: string; slug: string; name: string; locked: boolean; unlocked: boolean } | null
}
export interface Session { type: 'hls' | 'mjpeg' | 'embed'; url: string }

export const api = {
  catalog: () => req<Catalog>('GET', '/api/catalog'),
  camera: (id: string) => req<CameraDetail>('GET', `/api/cameras/${id}`),
  session: (id: string) => req<Session>('POST', `/api/cameras/${id}/session`),
  async unlock(kind: 'cluster' | 'camera', id: string, code: string) {
    const r = await req<{ grant: string }>('POST', '/api/unlock', { kind, id, code, grant: currentGrant() || undefined })
    setGrant(r.grant)
  },
}

// ---- Admin ----
export interface AdminCluster { id: string; slug: string; name: string; description: string; sort: number; accessMode: 'public' | 'protected'; hasCode: boolean; cameraCount: number }
export interface AdminCamera {
  id: string; name: string; description: string; location: string; clusterId: string | null
  sourceType: 'hls' | 'mjpeg' | 'rtsp' | 'embed'; sourceUrl: string; proxy: boolean; transcode: boolean
  listed: boolean; enabled: boolean; sort: number; accessMode: 'public' | 'protected'; hasCode: boolean
}
export interface AdminSettings {
  site_title: string; site_description: string; embed_origins: string; grant_ttl_hours: string
  embed_api_key: string; active_transcoders: string
}
export const admin = {
  status: () => req<{ needsSetup: boolean; setupTokenRequired: boolean; admin: { username: string } | null }>('GET', '/api/admin/status'),
  setup: (b: { username: string; password: string; setupToken?: string }) => req('POST', '/api/admin/setup', b),
  login: (b: { username: string; password: string }) => req('POST', '/api/admin/login', b),
  logout: () => req('POST', '/api/admin/logout'),
  password: (b: { current: string; next: string }) => req('POST', '/api/admin/password', b),
  clusters: () => req<AdminCluster[]>('GET', '/api/admin/clusters'),
  saveCluster: (id: string | null, b: unknown) => req<AdminCluster>(id ? 'PUT' : 'POST', id ? `/api/admin/clusters/${id}` : '/api/admin/clusters', b),
  deleteCluster: (id: string) => req('DELETE', `/api/admin/clusters/${id}`),
  cameras: () => req<AdminCamera[]>('GET', '/api/admin/cameras'),
  saveCamera: (id: string | null, b: unknown) => req<AdminCamera>(id ? 'PUT' : 'POST', id ? `/api/admin/cameras/${id}` : '/api/admin/cameras', b),
  deleteCamera: (id: string) => req('DELETE', `/api/admin/cameras/${id}`),
  settings: () => req<AdminSettings>('GET', '/api/admin/settings'),
  saveSettings: (b: unknown) => req('PUT', '/api/admin/settings', b),
  rotateKey: () => req<{ embed_api_key: string }>('POST', '/api/admin/settings/rotate-api-key'),
}
