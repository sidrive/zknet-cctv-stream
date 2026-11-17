import { useCallback, useEffect, useState, type FormEvent, useRef} from 'react'
import { Link } from 'react-router-dom'
import { admin, ApiError, type AdminCamera, type AdminCluster, type AdminSettings, type AdminUser } from '../api'
import Player from '../components/Player'

const errMsg = (e: unknown) => (e instanceof ApiError ? e.message : 'Terjadi kesalahan')

export default function Admin() {
  const [status, setStatus] = useState<Awaited<ReturnType<typeof admin.status>> | null>(null)
  const refresh = useCallback(() => { admin.status().then(setStatus).catch(() => undefined) }, [])
  useEffect(() => { refresh(); document.title = 'Admin' }, [refresh])

  if (!status) return <div className="container page"><p className="muted">Memuat…</p></div>
  if (status.needsSetup) return <AuthForm mode="setup" tokenRequired={status.setupTokenRequired} onDone={refresh} />
  if (!status.admin) return <AuthForm mode="login" onDone={refresh} />
  return <Dashboard username={status.admin.username} onLogout={refresh} />
}

function AuthForm({ mode, tokenRequired, onDone }: { mode: 'setup' | 'login'; tokenRequired?: boolean; onDone: () => void }) {
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [setupToken, setSetupToken] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    setBusy(true); setError('')
    try {
      if (mode === 'setup') await admin.setup({ username, password, setupToken: tokenRequired ? setupToken : undefined })
      else await admin.login({ username, password })
      onDone()
    } catch (err) { setError(errMsg(err)) } finally { setBusy(false) }
  }

  return (
    <div className="auth">
      <form className="card auth-card" onSubmit={submit}>
        <div style={{ textAlign: 'center', marginBottom: '1.25rem' }}>
          <img src="/zknet-logo.png" alt="ZKNet" style={{ height: 44, width: 'auto', objectFit: 'contain' }} />
        </div>
        <h1>{mode === 'setup' ? 'Setup admin pertama' : 'Login admin'}</h1>
        {mode === 'setup' && <p className="muted">Buat akun administrator untuk mengelola kamera dan cluster.</p>}
        <label className="field"><span>Username</span><input value={username} onChange={(e) => setUsername(e.target.value)} autoComplete="username" required minLength={3} /></label>
        <label className="field"><span>Password{mode === 'setup' && ' (min. 8 karakter)'}</span>
          <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete={mode === 'setup' ? 'new-password' : 'current-password'} required minLength={mode === 'setup' ? 8 : 1} /></label>
        {mode === 'setup' && tokenRequired && (
          <label className="field"><span>Setup token (dari env SETUP_TOKEN)</span><input type="password" value={setupToken} onChange={(e) => setSetupToken(e.target.value)} required /></label>
        )}
        {error && <p className="error" role="alert">{error}</p>}
        <button className="btn btn-primary" disabled={busy}>{mode === 'setup' ? 'Buat admin' : 'Masuk'}</button>
        <Link to="/" className="muted small">← Ke halaman publik</Link>
      </form>
    </div>
  )
}

type Tab = 'cameras' | 'clusters' | 'settings' | 'admins'

function Dashboard({ username, onLogout }: { username: string; onLogout: () => void }) {
  const [tab, setTab] = useState<Tab>('cameras')
  const [clusters, setClusters] = useState<AdminCluster[]>([])
  const [cameras, setCameras] = useState<AdminCamera[]>([])
  const load = useCallback(() => {
    admin.clusters().then(setClusters)
    admin.cameras().then(setCameras)
  }, [])
  useEffect(load, [load])

  return (
    <div className="container page">
      <div className="row between wrap" style={{ alignItems: 'center' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
          <img src="/zknet-logo.png" alt="ZKNet" style={{ height: 32, width: 'auto', objectFit: 'contain' }} />
          <h1 style={{ margin: 0 }}>Panel admin</h1>
        </div>
        <div className="row gap-s">
          <Link className="btn btn-ghost" to="/">Lihat situs</Link>
          <span className="muted small">{username}</span>
          <button className="btn btn-sm" onClick={async () => { await admin.logout(); onLogout() }}>Keluar</button>
        </div>
      </div>
      <div className="tabs" role="tablist">
        {(['cameras', 'clusters', 'admins', 'settings'] as Tab[]).map((t) => (
          <button key={t} role="tab" aria-selected={tab === t} className={tab === t ? 'active' : ''} onClick={() => setTab(t)}>
            {{ cameras: `Kamera (${cameras.length})`, clusters: `Cluster (${clusters.length})`, admins: 'Admin', settings: 'Pengaturan' }[t]}
          </button>
        ))}
      </div>
      {tab === 'cameras' && <Cameras cameras={cameras} clusters={clusters} reload={load} />}
      {tab === 'clusters' && <Clusters clusters={clusters} reload={load} />}
      {tab === 'admins' && <Admins />}
      {tab === 'settings' && <Settings />}
    </div>
  )
}

// ---------------- Admin lain ----------------
/** Tanggal SQLite ("2026-02-14 09:31:00", UTC) → teks lokal yang enak dibaca. */
const fmtWhen = (v: string | null) => {
  if (!v) return '—'
  const d = new Date(v.replace(' ', 'T') + 'Z')
  if (Number.isNaN(d.getTime())) return v
  return d.toLocaleString('id-ID', { dateStyle: 'medium', timeStyle: 'short' })
}

function Admins() {
  const [users, setUsers] = useState<AdminUser[]>([])
  const [msg, setMsg] = useState('')
  const [busy, setBusy] = useState(false)
  const [form, setForm] = useState<{ username: string; password: string } | null>(null)

  const load = useCallback(() => { admin.users().then(setUsers).catch((e) => setMsg(errMsg(e))) }, [])
  useEffect(load, [load])

  const run = async (fn: () => Promise<unknown>, sukses: string) => {
    setBusy(true); setMsg('')
    try { await fn(); setMsg(sukses); load() } catch (e) { setMsg(errMsg(e)) } finally { setBusy(false) }
  }

  const tambah = async (e: FormEvent) => {
    e.preventDefault()
    if (!form) return
    await run(async () => { await admin.createUser(form); setForm(null) }, `Admin "${form.username}" ditambahkan.`)
  }

  return (
    <>
      <div className="row between wrap" style={{ alignItems: 'center', marginTop: 16 }}>
        <p className="muted small" style={{ margin: 0, maxWidth: '58ch' }}>
          Setiap admin punya password sendiri. Menghapus akun atau mengeluarkan sesinya langsung berlaku —
          tidak menunggu cookie 12 jam.
        </p>
        <button className="btn btn-primary" onClick={() => { setMsg(''); setForm({ username: '', password: '' }) }}>+ Admin baru</button>
      </div>
      {msg && <p className="muted small" role="status">{msg}</p>}

      <div className="table-wrap">
        <table>
          <thead><tr><th>Username</th><th>Dibuat</th><th>Login terakhir</th><th> </th></tr></thead>
          <tbody>
            {users.map((u) => (
              <tr key={u.id}>
                <td>
                  <strong>{u.username}</strong>{u.isYou && <span className="zk-badge zk-badge--info" style={{ marginLeft: 8 }}>Anda</span>}
                </td>
                <td className="muted small">{fmtWhen(u.createdAt)}</td>
                <td className="muted small">{u.lastLoginAt ? fmtWhen(u.lastLoginAt) : 'belum pernah'}</td>
                <td className="actions"><div>
                  <button className="btn btn-sm" disabled={busy || u.isYou}
                    title={u.isYou ? 'Ganti password sendiri lewat tombol di kanan atas' : 'Ganti password admin ini'}
                    onClick={() => {
                      const pw = prompt(`Password baru untuk "${u.username}" (minimal 8 karakter):`)
                      if (!pw) return
                      run(() => admin.resetUserPassword(u.id, { password: pw }), `Password "${u.username}" diganti. Sesi lamanya ikut keluar.`)
                    }}>Ganti password</button>
                  <button className="btn btn-sm" disabled={busy || u.isYou}
                    title={u.isYou ? 'Untuk akun sendiri gunakan tombol Keluar' : 'Paksa login ulang di semua perangkat'}
                    onClick={() => {
                      if (!confirm(`Keluarkan semua sesi "${u.username}"?\n\nOrang itu harus login lagi.`)) return
                      run(() => admin.kickUser(u.id), `Semua sesi "${u.username}" dikeluarkan.`)
                    }}>Keluarkan sesi</button>
                  <button className="btn btn-sm btn-danger" disabled={busy || u.isYou}
                    title={u.isYou ? 'Tidak bisa menghapus akun sendiri' : 'Hapus akun admin ini'}
                    onClick={() => {
                      if (!confirm(`Hapus admin "${u.username}"?\n\nAkun ini langsung kehilangan akses. Kamera & cluster tidak terpengaruh.`)) return
                      run(() => admin.deleteUser(u.id), `Admin "${u.username}" dihapus.`)
                    }}>Hapus</button>
                </div></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {form && (
        <div className="modal-bg" onClick={() => setForm(null)}>
          <form className="modal" onClick={(e) => e.stopPropagation()} onSubmit={tambah}>
            <h2>Admin baru</h2>
            <label>Username
              <input value={form.username} autoFocus required minLength={3} maxLength={40}
                pattern="[A-Za-z0-9._\\-]+" onChange={(e) => setForm({ ...form, username: e.target.value })} />
            </label>
            <label>Password (minimal 8 karakter)
              <input type="password" value={form.password} required minLength={8}
                onChange={(e) => setForm({ ...form, password: e.target.value })} />
            </label>
            <div className="row gap-s" style={{ justifyContent: 'flex-end' }}>
              <button type="button" className="btn" onClick={() => setForm(null)}>Batal</button>
              <button className="btn btn-primary" disabled={busy}>Simpan</button>
            </div>
          </form>
        </div>
      )}
    </>
  )
}

// ---------------- Kamera ----------------
const EMPTY_CAM = {
  name: '', description: '', location: '', clusterId: '' as string, sourceType: 'hls', sourceUrl: '',
  proxy: true, transcode: false, listed: true, enabled: true, sort: '0' as string, accessMode: 'public', accessCode: '',
  lat: '' as string, lng: '' as string,
}
const SOURCE_HELP: Record<string, string> = {
  hls: 'URL playlist HLS (.m3u8). Dengan "sembunyikan URL sumber" server menjadi proxy sehingga URL asli tidak sampai ke browser.',
  mjpeg: 'URL stream MJPEG (multipart). Selalu lewat proxy server.',
  rtsp: 'rtsp://user:pass@ip:554/stream — server mengubah ke HLS dengan ffmpeg HANYA saat ada penonton. Tidak merekam.',
  embed: 'URL halaman yang bisa di-iframe (mis. YouTube Live). URL ini terlihat oleh penonton — hanya cocok untuk kamera publik.',
}

function Cameras({ cameras, clusters, reload }: { cameras: AdminCamera[]; clusters: AdminCluster[]; reload: () => void }) {
  const [editing, setEditing] = useState<AdminCamera | 'new' | null>(null)
  const [preview, setPreview] = useState<AdminCamera | null>(null)
  const clusterName = (id: string | null) => clusters.find((c) => c.id === id)?.name ?? '—'
  const remove = async (c: AdminCamera) => {
    if (!confirm(`Hapus kamera "${c.name}"?`)) return
    await admin.deleteCamera(c.id); reload()
  }

  // Geser satu langkah di dalam cluster yang sama. Server menerima seluruh urutan lalu
  // memberi sort 10, 20, 30… sehingga hasilnya pasti, termasuk saat banyak sort masih sama.
  const move = async (c: AdminCamera, dir: -1 | 1) => {
    const group = cameras.filter((x) => x.clusterId === c.clusterId)
    const i = group.findIndex((x) => x.id === c.id)
    const j = i + dir
    if (j < 0 || j >= group.length) return
    const ids = group.map((x) => x.id)
    ;[ids[i], ids[j]] = [ids[j], ids[i]]
    await admin.reorderCameras(ids)
    reload()
  }

  return (
    <section>
      <div className="row between"><h2>Kamera</h2><button className="btn btn-primary" onClick={() => setEditing('new')}>+ Tambah kamera</button></div>
      <div className="table-wrap">
        <table>
          <thead><tr><th>Nama</th><th>Cluster</th><th className="col-hide-sm">Sumber</th><th>Akses</th><th className="col-hide-sm">Status</th><th /></tr></thead>
          <tbody>
            {cameras.map((c) => (
              <tr key={c.id}>
                <td><strong>{c.name}</strong><div className="muted small">{c.location}</div></td>
                <td>{clusterName(c.clusterId)}</td>
                <td className="col-hide-sm">{c.sourceType.toUpperCase()}</td>
                <td><span className={`chip ${c.accessMode === 'protected' ? 'chip-lock' : 'chip-free'}`}>{c.accessMode === 'protected' ? '🔒 Kode' : 'Gratis'}</span></td>
                <td className="col-hide-sm">{c.enabled ? (c.listed ? 'Aktif' : 'Aktif (tak terdaftar)') : 'Nonaktif'}</td>
                <td className="actions"><div>
                  <button className="btn btn-sm" title="Naikkan urutan" aria-label={`Naikkan ${c.name}`}
                    onClick={() => move(c, -1)}>↑</button>
                  <button className="btn btn-sm" title="Turunkan urutan" aria-label={`Turunkan ${c.name}`}
                    onClick={() => move(c, 1)}>↓</button>
                  <button className="btn btn-sm" onClick={() => setPreview(c)}>Uji</button>
                  <button className="btn btn-sm" onClick={() => setEditing(c)}>Edit</button>
                  <button className="btn btn-sm btn-danger" onClick={() => remove(c)}>Hapus</button>
                </div></td>
              </tr>
            ))}
            {cameras.length === 0 && <tr><td colSpan={6} className="muted">Belum ada kamera.</td></tr>}
          </tbody>
        </table>
      </div>
      {editing && <CameraForm cam={editing === 'new' ? null : editing} clusters={clusters} onClose={() => setEditing(null)} onSaved={() => { setEditing(null); reload() }} onChanged={reload} />}
      {preview && (
        <div className="modal-backdrop" onClick={() => setPreview(null)}>
          <div className="modal modal-wide" onClick={(e) => e.stopPropagation()}>
            <div className="row between"><h2>{preview.name}</h2><button className="btn btn-sm" onClick={() => setPreview(null)}>Tutup</button></div>
            <Player cameraId={preview.id} />
          </div>
        </div>
      )}
    </section>
  )
}

function CameraForm({ cam, clusters, onClose, onSaved, onChanged }: { cam: AdminCamera | null; clusters: AdminCluster[]; onClose: () => void; onSaved: () => void; onChanged: () => void }) {
  const [f, setF] = useState(() => cam ? { ...EMPTY_CAM, ...cam, clusterId: cam.clusterId ?? '', accessCode: '', lat: cam.lat != null ? String(cam.lat) : '', lng: cam.lng != null ? String(cam.lng) : '' } : { ...EMPTY_CAM })
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [picking, setPicking] = useState(false)
  const [locating, setLocating] = useState(false)
  const set = <K extends keyof typeof EMPTY_CAM>(k: K, v: (typeof EMPTY_CAM)[K]) => setF((x) => ({ ...x, [k]: v }))

  // Ambil posisi dari browser (butuh HTTPS atau localhost). Berguna saat memasang kamera baru.
  const useHere = () => {
    if (!navigator.geolocation) { setError('Browser tidak mendukung geolokasi.'); return }
    setLocating(true)
    navigator.geolocation.getCurrentPosition(
      (pos) => { setF((x) => ({ ...x, lat: pos.coords.latitude.toFixed(6), lng: pos.coords.longitude.toFixed(6) })); setLocating(false) },
      (e) => { setError(`Gagal ambil lokasi: ${e.message}`); setLocating(false) },
      { enableHighAccuracy: true, timeout: 10000 },
    )
  }

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    setBusy(true); setError('')
    try {
      await admin.saveCamera(cam?.id ?? null, {
        name: f.name, description: f.description, location: f.location,
        clusterId: f.clusterId || null, sourceType: f.sourceType, sourceUrl: f.sourceUrl,
        proxy: f.proxy, transcode: f.transcode, listed: f.listed, enabled: f.enabled, sort: Number(f.sort) || 0,
        accessMode: f.accessMode, accessCode: f.accessCode || undefined,
        lat: f.lat.trim() === '' ? null : Number(f.lat),
        lng: f.lng.trim() === '' ? null : Number(f.lng),
      })
      onSaved()
    } catch (err) { setError(errMsg(err)) } finally { setBusy(false) }
  }

  return (
    <div className="modal-backdrop">
      <form className="modal modal-wide scroll" onSubmit={submit}>
        <h2>{cam ? 'Edit kamera' : 'Tambah kamera'}</h2>
        <div className="form-grid">
          <label className="field"><span>Nama</span><input value={f.name} onChange={(e) => set('name', e.target.value)} required /></label>
          <label className="field"><span>Lokasi</span><input value={f.location} onChange={(e) => set('location', e.target.value)} /></label>
          <label className="field full"><span>Deskripsi</span><input value={f.description} onChange={(e) => set('description', e.target.value)} /></label>
          <label className="field"><span>Cluster</span>
            <select value={f.clusterId} onChange={(e) => set('clusterId', e.target.value)}>
              <option value="">— Tanpa cluster —</option>
              {clusters.map((c) => <option key={c.id} value={c.id}>{c.name}{c.accessMode === 'protected' ? ' 🔒' : ''}</option>)}
            </select></label>
          <label className="field"><span>Urutan</span>
            <input type="number" step={1} value={f.sort} onChange={(e) => set('sort', e.target.value)} />
            <small className="muted">Angka kecil tampil lebih dulu. Sama = urut nama.</small></label>
          <label className="field"><span>Tipe sumber</span>
            <select value={f.sourceType} onChange={(e) => set('sourceType', e.target.value)}>
              <option value="hls">HLS (.m3u8)</option><option value="rtsp">RTSP / RTMP / SRT (via ffmpeg)</option>
              <option value="mjpeg">MJPEG</option><option value="embed">Embed (iframe)</option>
            </select></label>
          <label className="field full"><span>URL sumber</span><input value={f.sourceUrl} onChange={(e) => set('sourceUrl', e.target.value)} required placeholder="https://…/index.m3u8" />
            <small className="muted">{SOURCE_HELP[f.sourceType]}</small></label>
          {f.sourceType === 'hls' && <label className="check full"><input type="checkbox" checked={f.proxy} onChange={(e) => set('proxy', e.target.checked)} /> Sembunyikan URL sumber (lewat proxy server). Nonaktifkan hanya untuk kamera publik agar hemat bandwidth.</label>}
          {f.sourceType === 'rtsp' && <label className="check full"><input type="checkbox" checked={f.transcode} onChange={(e) => set('transcode', e.target.checked)} /> Transcode ke H.264 (perlu jika kamera H.265; memakai CPU)</label>}
          <label className="field"><span>Akses</span>
            <select value={f.accessMode} onChange={(e) => set('accessMode', e.target.value)}>
              <option value="public">Gratis (publik)</option><option value="protected">Perlu kode/password</option>
            </select></label>
          {f.accessMode === 'protected' && (
            <label className="field"><span>Kode akses {cam?.hasCode && '(kosongkan = tetap)'}</span>
              <input type="text" value={f.accessCode} onChange={(e) => set('accessCode', e.target.value)} autoComplete="off" required={!cam?.hasCode || cam.accessMode !== 'protected'} /></label>
          )}
          {cam && (
            <AccessCodePanel kind="camera" id={cam.id} protectedMode={f.accessMode === 'protected'} codeViewable={cam.codeViewable} onChanged={onChanged} />
          )}
          <label className="check"><input type="checkbox" checked={f.enabled} onChange={(e) => set('enabled', e.target.checked)} /> Aktif</label>
          <label className="check"><input type="checkbox" checked={f.listed} onChange={(e) => set('listed', e.target.checked)} /> Tampil di daftar (matikan = hanya via link langsung)</label>
          <p className="muted small full" style={{margin: 0}}>Koordinat untuk Peta Lokasi. Kosongkan bila belum diketahui — kamera tanpa koordinat tidak digambar di peta (bukan di 0,0). Kamera berkode tetap menyembunyikan koordinatnya sampai dibuka.</p>
          <label className="field"><span>Latitude</span><input inputMode="decimal" value={f.lat} onChange={(e) => set('lat', e.target.value)} placeholder="-7.93878" /></label>
          <label className="field"><span>Longitude</span><input inputMode="decimal" value={f.lng} onChange={(e) => set('lng', e.target.value)} placeholder="110.24649" /></label>
          <div className="row gap-s wrap full">
            <button type="button" className="btn btn-sm" onClick={() => { setPicking(true) }}>Pilih dari peta…</button>
            <button type="button" className="btn btn-sm" onClick={useHere} disabled={locating}>{locating ? 'Mencari…' : 'Lokasi saat ini'}</button>
            {(f.lat || f.lng) && <button type="button" className="btn btn-sm btn-ghost" onClick={() => { set('lat', ''); set('lng', '') }}>Kosongkan</button>}
          </div>
        </div>
        {error && <p className="error" role="alert">{error}</p>}
        <div className="row end"><button type="button" className="btn btn-ghost" onClick={onClose}>Batal</button><button className="btn btn-primary" disabled={busy}>Simpan</button></div>
      </form>
      {picking && (
        <CoordPicker
          lat={f.lat ? Number(f.lat) : null}
          lng={f.lng ? Number(f.lng) : null}
          onClose={() => setPicking(false)}
          onPick={(la, ln) => { setF((x) => ({ ...x, lat: la.toFixed(6), lng: ln.toFixed(6) })); setPicking(false) }}
        />
      )}
    </div>
  )
}

// Pemilih koordinat: klik peta untuk menaruh pin. Memakai MapLibre (dimuat malas agar
// bundel admin tidak membengkak). Default tampilan DIY karena semua kamera di sana.
const DIY_CENTER: [number, number] = [110.3695, -7.875]

function CoordPicker({ lat, lng, onPick, onClose }: { lat: number | null; lng: number | null; onPick: (lat: number, lng: number) => void; onClose: () => void }) {
  const box = useRef<HTMLDivElement>(null)
  const [ready, setReady] = useState(false)
  const [cur, setCur] = useState<{ lat: number; lng: number } | null>(lat != null && lng != null ? { lat, lng } : null)
  const cb = useRef(onPick); cb.current = onPick
  const mapRef = useRef<import('maplibre-gl').Map | null>(null)
  const pinRef = useRef<import('maplibre-gl').Marker | null>(null)
  const start = useRef(cur)

  useEffect(() => {
    let dead = false
    import('../components/mapInit').then(async ({ createMap }) => {
      if (dead || !box.current) return
      const map = await createMap({ container: box.current, center: start.current ? [start.current.lng, start.current.lat] : DIY_CENTER, zoom: start.current ? 15 : 11 })
      if (dead) { map.remove(); return }
      mapRef.current = map
      setReady(true)
      map.on('click', (e) => {
        const next = { lat: e.lngLat.lat, lng: e.lngLat.lng }
        setCur(next)
        // Pin harus terlihat, kalau tidak admin menebak titik yang dipilih.
        import('maplibre-gl').then(({ Marker }) => {
          if (!pinRef.current) pinRef.current = new Marker({ color: '#D4AF37' }).setLngLat([next.lng, next.lat]).addTo(map)
          else pinRef.current.setLngLat([next.lng, next.lat])
        })
      })
    })
    return () => {
      dead = true
      pinRef.current?.remove(); pinRef.current = null
      mapRef.current?.remove(); mapRef.current = null
    }
  }, [])

  return (
    <div className="modal-backdrop">
      <div className="modal modal-wide">
        <h2>Pilih lokasi kamera</h2>
        <p className="muted small">Klik pada peta untuk menaruh pin, lalu tekan Pakai.</p>
        <div ref={box} className="coord-picker-map" />
        <div className="row between">
          <code>{cur ? `${cur.lat.toFixed(6)}, ${cur.lng.toFixed(6)}` : 'belum dipilih'}</code>
          <div className="row gap-s">
            <button className="btn btn-ghost" onClick={onClose}>Batal</button>
            <button className="btn btn-primary" disabled={!ready || !cur} onClick={() => cur && cb.current(cur.lat, cur.lng)}>Pakai koordinat</button>
          </div>
        </div>
      </div>
    </div>
  )
}


/**
 * Panel kode akses di form cluster/kamera.
 *
 * Kode disimpan terenkripsi (bukan hanya hash), jadi admin bisa melihat lagi
 * untuk dibagikan. "Cabut akses" mematikan semua grant yang sudah beredar
 * (termasuk link `?grant=` dan embed) tanpa menunggu masa berlaku habis.
 */
function AccessCodePanel({ kind, id, protectedMode, codeViewable, onChanged }: {
  kind: 'cluster' | 'camera'
  id: string
  protectedMode: boolean
  codeViewable: boolean
  onChanged: () => void
}) {
  const [code, setCode] = useState<string | null>(null)
  const [note, setNote] = useState('')
  const [msg, setMsg] = useState('')
  const [busy, setBusy] = useState(false)

  const load = useCallback(async () => {
    try {
      const r = kind === 'cluster' ? await admin.clusterCode(id) : await admin.cameraCode(id)
      setCode(r.code); setNote('')
    } catch (err) { setCode(null); setNote(errMsg(err)) }
  }, [kind, id])

  useEffect(() => { if (protectedMode && codeViewable) load() }, [protectedMode, codeViewable, load])

  if (!protectedMode) return null

  const revoke = async (rotate: boolean) => {
    const pesan = rotate
      ? `Cabut akses dan ganti kode?\n\nSemua yang sudah membuka kunci (termasuk embed) harus memakai kode baru.`
      : `Cabut akses tanpa mengganti kode?\n\nSemua tautan/grant yang sudah dibagikan langsung berhenti, TETAPI siapa pun yang tahu kode lama masih bisa membuka lagi.`
    if (!confirm(pesan)) return
    setBusy(true); setMsg('')
    try {
      const r = rotate
        ? (kind === 'cluster' ? await admin.revokeCluster(id, { rotate: true }) : await admin.revokeCamera(id, { rotate: true }))
        : (kind === 'cluster' ? await admin.revokeCluster(id, {}) : await admin.revokeCamera(id, {}))
      if (r.code) setCode(r.code)
      setMsg(rotate ? `Kode baru dibuat (versi akses ${r.accessVersion}). Salin dan bagikan.` : `Akses dicabut (versi akses ${r.accessVersion}). Tautan lama tidak berlaku lagi.`)
      if (!r.code) load()
      onChanged()
    } catch (err) { setMsg(errMsg(err)) } finally { setBusy(false) }
  }

  return (
    <div className="code-panel">
      <span className="code-panel__title">Kode akses saat ini</span>
      {code ? (
        <div className="code-panel__row">
          <code className="code-panel__value">{code}</code>
          <button type="button" className="btn btn-sm" onClick={() => { navigator.clipboard?.writeText(code); setMsg('Kode disalin.') }}>Salin</button>
        </div>
      ) : (
        <p className="muted small" style={{ margin: 0 }}>{note || 'Memuat kode…'}</p>
      )}
      <div className="code-panel__actions">
        <button type="button" className="btn btn-sm" disabled={busy} onClick={() => revoke(true)}>Cabut + ganti kode</button>
        <button type="button" className="btn btn-sm btn-danger" disabled={busy} onClick={() => revoke(false)}>Cabut akses saja</button>
      </div>
      <p className="muted small" style={{ margin: 0 }}>
        "Cabut akses" mematikan tautan/grant yang sudah beredar seketika. "Cabut + ganti kode" juga membuat kode lama tidak berlaku.
      </p>
      {msg && <p className="small" role="status" style={{ margin: 0 }}>{msg}</p>}
    </div>
  )
}

// ---------------- Cluster ----------------
function Clusters({ clusters, reload }: { clusters: AdminCluster[]; reload: () => void }) {
  const [editing, setEditing] = useState<AdminCluster | 'new' | null>(null)
  const remove = async (c: AdminCluster) => {
    if (!confirm(`Hapus cluster "${c.name}"? ${c.cameraCount} kamera di dalamnya TIDAK dihapus, tapi tidak lagi memakai aturan akses cluster ini.`)) return
    await admin.deleteCluster(c.id); reload()
  }
  return (
    <section>
      <div className="row between"><h2>Cluster</h2><button className="btn btn-primary" onClick={() => setEditing('new')}>+ Tambah cluster</button></div>
      <div className="table-wrap"><table>
        <thead><tr><th>Nama</th><th>Slug</th><th>Kamera</th><th>Akses</th><th /></tr></thead>
        <tbody>
          {clusters.map((c) => (
            <tr key={c.id}>
              <td><strong>{c.name}</strong><div className="muted small">{c.description}</div></td>
              <td><code>/c/{c.slug}</code></td><td>{c.cameraCount}</td>
              <td><span className={`chip ${c.accessMode === 'protected' ? 'chip-lock' : 'chip-free'}`}>{c.accessMode === 'protected' ? '🔒 Kode' : 'Gratis'}</span></td>
              <td className="actions"><div><button className="btn btn-sm" onClick={() => setEditing(c)}>Edit</button><button className="btn btn-sm btn-danger" onClick={() => remove(c)}>Hapus</button></div></td>
            </tr>
          ))}
          {clusters.length === 0 && <tr><td colSpan={5} className="muted">Belum ada cluster.</td></tr>}
        </tbody></table></div>
      {editing && <ClusterForm cluster={editing === 'new' ? null : editing} onClose={() => setEditing(null)} onSaved={() => { setEditing(null); reload() }} onChanged={reload} />}
    </section>
  )
}

function ClusterForm({ cluster, onClose, onSaved, onChanged }: { cluster: AdminCluster | null; onClose: () => void; onSaved: () => void; onChanged: () => void }) {
  const [f, setF] = useState({ name: cluster?.name ?? '', slug: cluster?.slug ?? '', description: cluster?.description ?? '', sort: String(cluster?.sort ?? 0), accessMode: cluster?.accessMode ?? 'public', accessCode: '' })
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const slugify = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')
  const submit = async (e: FormEvent) => {
    e.preventDefault(); setBusy(true); setError('')
    try {
      await admin.saveCluster(cluster?.id ?? null, { ...f, sort: Number(f.sort) || 0, accessCode: f.accessCode || undefined })
      onSaved()
    } catch (err) { setError(errMsg(err)) } finally { setBusy(false) }
  }
  return (
    <div className="modal-backdrop">
      <form className="modal" onSubmit={submit}>
        <h2>{cluster ? 'Edit cluster' : 'Tambah cluster'}</h2>
        <label className="field"><span>Nama</span><input value={f.name} onChange={(e) => setF({ ...f, name: e.target.value, slug: cluster ? f.slug : slugify(e.target.value) })} required /></label>
        <label className="field"><span>Slug (URL)</span><input value={f.slug} onChange={(e) => setF({ ...f, slug: e.target.value })} required pattern="[a-z0-9\-]+" /></label>
        <label className="field"><span>Deskripsi</span><input value={f.description} onChange={(e) => setF({ ...f, description: e.target.value })} /></label>
        <label className="field"><span>Urutan</span>
          <input type="number" step={1} value={f.sort} onChange={(e) => setF({ ...f, sort: e.target.value })} />
          <small className="muted">Angka kecil tampil lebih dulu di beranda. Sama = urut nama.</small></label>
        <label className="field"><span>Akses cluster</span>
          <select value={f.accessMode} onChange={(e) => setF({ ...f, accessMode: e.target.value as 'public' | 'protected' })}>
            <option value="public">Gratis (publik)</option><option value="protected">Perlu kode/password</option>
          </select></label>
        {f.accessMode === 'protected' && (
          <label className="field"><span>Kode akses {cluster?.hasCode && '(kosongkan = tetap)'}</span>
            <input value={f.accessCode} onChange={(e) => setF({ ...f, accessCode: e.target.value })} autoComplete="off" required={!cluster?.hasCode || cluster.accessMode !== 'protected'} /></label>
        )}
        <p className="muted small">Kode cluster membuka daftar kameranya. Kamera yang punya kode sendiri tetap meminta kodenya.</p>
        {cluster && (
          <AccessCodePanel kind="cluster" id={cluster.id} protectedMode={f.accessMode === 'protected'} codeViewable={cluster.codeViewable} onChanged={onChanged} />
        )}
        {error && <p className="error" role="alert">{error}</p>}
        <div className="row end"><button type="button" className="btn btn-ghost" onClick={onClose}>Batal</button><button className="btn btn-primary" disabled={busy}>Simpan</button></div>
      </form>
    </div>
  )
}

// ---------------- Pengaturan & Embed ----------------
function Settings() {
  const [s, setS] = useState<AdminSettings | null>(null)
  const [msg, setMsg] = useState('')
  const [pw, setPw] = useState({ current: '', next: '' })
  useEffect(() => { admin.settings().then(setS) }, [])
  if (!s) return <p className="muted">Memuat…</p>
  const origin = location.origin

  const save = async (e: FormEvent) => {
    e.preventDefault()
    try { await admin.saveSettings({ site_title: s.site_title, site_description: s.site_description, embed_origins: s.embed_origins, grant_ttl_hours: Number(s.grant_ttl_hours) }); setMsg('Tersimpan ✓') } catch (err) { setMsg(errMsg(err)) }
  }
  const changePw = async (e: FormEvent) => {
    e.preventDefault()
    try { await admin.password(pw); setPw({ current: '', next: '' }); setMsg('Password diganti ✓') } catch (err) { setMsg(errMsg(err)) }
  }
  const rotate = async () => {
    if (!confirm('Buat API key baru? Backend host yang memakai key lama akan berhenti bekerja.')) return
    const r = await admin.rotateKey(); setS({ ...s, embed_api_key: r.embed_api_key })
  }

  return (
    <section className="stack">
      {msg && <p className="notice" role="status">{msg}</p>}
      <form className="card stack" onSubmit={save}>
        <h2>Situs</h2>
        <label className="field"><span>Judul situs</span><input value={s.site_title} onChange={(e) => setS({ ...s, site_title: e.target.value })} required /></label>
        <label className="field"><span>Deskripsi</span><input value={s.site_description} onChange={(e) => setS({ ...s, site_description: e.target.value })} /></label>
        <label className="field"><span>Masa berlaku kode yang sudah dibuka (jam)</span><input type="number" min={1} max={720} value={s.grant_ttl_hours} onChange={(e) => setS({ ...s, grant_ttl_hours: e.target.value })} /></label>
        <label className="field"><span>Origin yang boleh meng-embed (satu per baris, kosong = semua)</span>
          <textarea rows={3} value={s.embed_origins} onChange={(e) => setS({ ...s, embed_origins: e.target.value })} placeholder="https://app.contoh.com" /></label>
        <div className="row end"><button className="btn btn-primary">Simpan</button></div>
      </form>

      <div className="card stack">
        <h2>Pasang di aplikasi lain (mini-app)</h2>
        <p className="muted">Tempel snippet ini di aplikasi host. Ganti <code>cluster</code> dengan slug cluster, atau pakai <code>data-camera</code> untuk satu kamera.</p>
        <pre>{`<script src="${origin}/embed.js"\n        data-cluster="slug-cluster"\n        data-height="480"></script>`}</pre>
        <p className="muted">Atau iframe langsung: <code>{origin}/embed?cluster=slug-cluster</code></p>
        <h3>SSO dari backend host</h3>
        <p className="muted">Agar user aplikasi host tidak perlu mengetik kode, backend host meminta <em>grant</em> lalu meneruskannya ke embed (<code>data-grant</code>). API key jangan pernah ditaruh di frontend.</p>
        <pre>{`curl -X POST ${origin}/api/embed/grant \\\n  -H "x-api-key: ${s.embed_api_key}" -H "content-type: application/json" \\\n  -d '{"clusters":["slug-cluster"],"ttlMinutes":60}'`}</pre>
        <div className="row between"><span className="muted small">Transcoder ffmpeg aktif: {s.active_transcoders}</span><button className="btn btn-sm btn-danger" onClick={rotate}>Buat ulang API key</button></div>
      </div>

      <form className="card stack" onSubmit={changePw}>
        <h2>Ganti password admin</h2>
        <label className="field"><span>Password saat ini</span><input type="password" value={pw.current} onChange={(e) => setPw({ ...pw, current: e.target.value })} required autoComplete="current-password" /></label>
        <label className="field"><span>Password baru (min. 8)</span><input type="password" value={pw.next} onChange={(e) => setPw({ ...pw, next: e.target.value })} required minLength={8} autoComplete="new-password" /></label>
        <div className="row end"><button className="btn">Ganti password</button></div>
      </form>
    </section>
  )
}
