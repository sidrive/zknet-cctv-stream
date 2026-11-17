import { useEffect, useState, type ReactNode } from 'react'
import { Link, useLocation } from 'react-router-dom'

/**
 * Kerangka halaman publik: sidebar navigasi + topbar.
 *
 * Sebelumnya sidebar hanya ada di Beranda; halaman lain memakai `zk-app--plain`
 * dengan tautan "← Beranda" sendiri-sendiri, sehingga menu hilang begitu
 * pengunjung masuk ke Cluster/Peta/Status. Sekarang semua halaman publik
 * memakai kerangka ini, dan item menu yang sedang dibuka ditandai otomatis.
 */
type Props = {
  title: string
  subtitle?: string
  /** Kolom cari (opsional). Hanya Beranda yang punya pencarian langsung. */
  search?: ReactNode
  /** Tombol kanan topbar (notifikasi, avatar, aksi halaman). */
  actions?: ReactNode
  children: ReactNode
}

type NavItem = { key: string; to: string; label: string; icon: string }

const NAV: NavItem[] = [
  { key: 'dashboard', to: '/', label: 'Dashboard', icon: 'i-home' },
  { key: 'cctv', to: '/#cctv-publik', label: 'CCTV Publik', icon: 'i-cam' },
  { key: 'cluster', to: '/cluster', label: 'Cluster', icon: 'i-users' },
  { key: 'peta', to: '/peta', label: 'Peta Lokasi', icon: 'i-map' },
  { key: 'status', to: '/status', label: 'Status Jaringan', icon: 'i-signal' },
  { key: 'admin', to: '/admin', label: 'Pengaturan', icon: 'i-gear' },
]

/** Menu mana yang sedang aktif, berdasarkan path dan anchor. */
export function activeNavKey(pathname: string, hash: string): string {
  if (pathname === '/') {
    if (hash === '#cctv-publik') return 'cctv'
    if (hash === '#cluster') return 'cluster'
    return 'dashboard'
  }
  if (pathname.startsWith('/cluster')) return 'cluster'
  if (pathname.startsWith('/c/')) return 'cluster'
  if (pathname.startsWith('/v/')) return 'cctv'
  if (pathname.startsWith('/peta')) return 'peta'
  if (pathname.startsWith('/status')) return 'status'
  if (pathname.startsWith('/admin')) return 'admin'
  return ''
}

export default function AppShell({ title, subtitle, search, actions, children }: Props) {
  const [menuOpen, setMenuOpen] = useState(false)
  const { pathname, hash } = useLocation()
  const active = activeNavKey(pathname, hash)
  const close = () => setMenuOpen(false)

  // Menu mobile menutup sendiri setelah pindah halaman.
  useEffect(close, [pathname, hash])

  return (
    <div className="zk-app">
      {menuOpen && <div className="zk-drawer-backdrop" onClick={close} aria-hidden="true" />}

      <aside className={`zk-sidebar ${menuOpen ? 'is-open' : ''}`} aria-label="Navigasi utama">
        <div className="zk-sidebar__header">
          <Link className="zk-brand" to="/" onClick={close} aria-label="ZKNet, beranda">
            <img src="/zknet-logo.png" alt="ZKNet - Internet untuk Desa" className="zk-brand__logo" />
          </Link>
          <button className="zk-icon-btn zk-sidebar__close" onClick={close} aria-label="Tutup menu">
            <svg className="zk-icon"><use href="#i-close" /></svg>
          </button>
        </div>

        <nav className="zk-nav">
          {NAV.map((item) => (
            <Link
              key={item.key}
              className={`zk-nav__item${active === item.key ? ' is-active' : ''}`}
              to={item.to}
              onClick={close}
              aria-current={active === item.key ? 'page' : undefined}
            >
              <svg className="zk-icon"><use href={`#${item.icon}`} /></svg>
              {item.label}
            </Link>
          ))}
        </nav>

        <div className="zk-sidebar__footer zk-promo-side">
          <h3 className="zk-promo-side__title">Pasang Internet ZKNet</h3>
          <p className="zk-text-sm" style={{ margin: 0 }}>Internet stabil, buat kebutuhan rumah dan usaha Anda</p>
          <a className="zk-btn zk-btn--whatsapp zk-btn--sm" href="https://wa.me/6285640420791" target="_blank" rel="noreferrer">085640420791</a>
        </div>
      </aside>

      <main className="zk-main">
        <header className="zk-topbar">
          <button className="zk-icon-btn zk-menu-btn" onClick={() => setMenuOpen(true)} aria-label="Buka menu navigasi">
            <svg className="zk-icon"><use href="#i-menu" /></svg>
          </button>
          <Link to="/" className="zk-topbar__brand" aria-label="ZKNet">
            <img src="/zknet-logo.png" alt="ZKNet" className="zk-topbar__logo" />
          </Link>

          <div className="zk-topbar__title">
            <h1>{title}</h1>
            {subtitle && <p>{subtitle}</p>}
          </div>
          {search}
          {actions && <div className="zk-topbar__actions">{actions}</div>}
        </header>

        {children}
      </main>
    </div>
  )
}
