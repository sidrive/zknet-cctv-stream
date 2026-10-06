import { useEffect, useRef, useState, type FormEvent } from 'react'
import { api, ApiError } from '../api'

interface Props {
  kind: 'cluster' | 'camera'
  id: string
  title: string
  onClose: () => void
  onUnlocked: () => void
}

export default function UnlockDialog({ kind, id, title, onClose, onUnlocked }: Props) {
  const [code, setCode] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const input = useRef<HTMLInputElement>(null)

  useEffect(() => {
    input.current?.focus()
    const esc = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', esc)
    return () => window.removeEventListener('keydown', esc)
  }, [onClose])

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    setBusy(true)
    setError('')
    try {
      await api.unlock(kind, id, code)
      onUnlocked()
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Gagal membuka akses')
      setCode('')
      input.current?.focus()
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <form className="modal" role="dialog" aria-modal="true" aria-label="Masukkan kode akses" onClick={(e) => e.stopPropagation()} onSubmit={submit}>
        <h2>🔒 {title}</h2>
        <p className="muted">{kind === 'cluster' ? 'Cluster ini' : 'Kamera ini'} membutuhkan kode akses.</p>
        <label className="field">
          <span>Kode akses</span>
          <input ref={input} type="password" value={code} onChange={(e) => setCode(e.target.value)} autoComplete="off" required />
        </label>
        {error && <p className="error" role="alert">{error}</p>}
        <div className="row end">
          <button type="button" className="btn btn-ghost" onClick={onClose}>Batal</button>
          <button className="btn btn-primary" disabled={busy || !code}>{busy ? 'Memeriksa…' : 'Buka'}</button>
        </div>
      </form>
    </div>
  )
}
