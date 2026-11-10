import { useLayoutEffect, useRef } from 'react'
import gsap from 'gsap'
import { CloudUpload, Gauge, LogOut, Megaphone, Rocket, Server, Settings } from 'lucide-react'
import type { PageId } from '../lib/types'
import { prefersReducedMotion } from '../lib/gsap'

interface SidebarProps {
  siteName: string
  username: string
  page: PageId
  wide: boolean
  collapsed: boolean
  mobileOpen: boolean
  onNavigate: (page: PageId) => void
  onClose: () => void
  onLogout: () => void
}

const WIDTH_EXPANDED = 248
const WIDTH_COLLAPSED = 72

const NAV = [
  { id: 'overview', label: '概览', icon: Gauge },
  { id: 'release', label: '更新推送', icon: CloudUpload },
  { id: 'announcements', label: '公告', icon: Megaphone },
  { id: 'mirrors', label: '镜像节点', icon: Server },
  { id: 'settings', label: '设置', icon: Settings },
] as const

export function Sidebar({
  siteName,
  username,
  page,
  wide,
  collapsed,
  mobileOpen,
  onNavigate,
  onClose,
  onLogout,
}: SidebarProps) {
  const asideRef = useRef<HTMLElement | null>(null)
  const backdropRef = useRef<HTMLButtonElement | null>(null)
  const initialized = useRef(false)
  const widthInitialized = useRef(false)

  useLayoutEffect(() => {
    const aside = asideRef.current
    if (!aside) return

    if (!wide) {
      gsap.set(aside, { clearProps: 'width' })
      return
    }

    const target = collapsed ? WIDTH_COLLAPSED : WIDTH_EXPANDED
    if (!widthInitialized.current || prefersReducedMotion()) {
      gsap.set(aside, { width: target })
      widthInitialized.current = true
      return
    }

    const tween = gsap.to(aside, { width: target, duration: 0.24, ease: 'power2.out' })
    return () => {
      tween.kill()
    }
  }, [collapsed, wide])

  useLayoutEffect(() => {
    const aside = asideRef.current
    if (!aside) return
    const backdrop = backdropRef.current

    if (wide) {
      gsap.set(aside, { clearProps: 'transform' })
      if (backdrop) gsap.set(backdrop, { opacity: 0 })
      initialized.current = true
      return
    }

    if (!initialized.current) {
      gsap.set(aside, { x: mobileOpen ? 0 : '-100%' })
      if (backdrop) gsap.set(backdrop, { opacity: mobileOpen ? 1 : 0 })
      initialized.current = true
      return
    }

    const tween = gsap.to(aside, {
      x: mobileOpen ? 0 : '-100%',
      duration: prefersReducedMotion() ? 0 : 0.28,
      ease: 'power3.out',
    })
    const fade = backdrop
      ? gsap.to(backdrop, { opacity: mobileOpen ? 1 : 0, duration: prefersReducedMotion() ? 0 : 0.2 })
      : null

    return () => {
      tween.kill()
      fade?.kill()
    }
  }, [wide, mobileOpen])

  return (
    <>
      <aside
        className={`${wide ? 'sidebar' : 'sidebar is-drawer'}${wide && collapsed ? ' is-collapsed' : ''}`}
        ref={asideRef}
      >
        <div className="brand">
          <span className="brand-mark">
            <Rocket size={18} />
          </span>
          <div className="brand-text">
            <strong className="brand-name">{siteName}</strong>
            <span className="brand-sub">管理后台</span>
          </div>
        </div>

        <nav className="nav" aria-label="主导航">
          {NAV.map((item) => {
            const Icon = item.icon
            const active = page === item.id
            return (
              <button
                key={item.id}
                type="button"
                className={active ? 'nav-item is-active' : 'nav-item'}
                aria-current={active ? 'page' : undefined}
                title={collapsed ? item.label : undefined}
                onClick={() => onNavigate(item.id)}
              >
                <Icon size={18} />
                <span>{item.label}</span>
              </button>
            )
          })}
        </nav>

        <div className="sidebar-foot">
          <div className="account" title={collapsed ? username : undefined}>
            <span className="account-avatar">{username.slice(0, 1).toUpperCase() || 'A'}</span>
            <div className="account-text">
              <strong>{username || 'admin'}</strong>
              <span>管理员</span>
            </div>
          </div>
          <button
            type="button"
            className="btn btn-ghost btn-sm"
            title={collapsed ? '退出登录' : undefined}
            onClick={onLogout}
          >
            <LogOut size={16} />
            <span className="sidebar-logout-label">退出登录</span>
          </button>
        </div>
      </aside>

      {!wide ? (
        <button
          type="button"
          ref={backdropRef}
          className={mobileOpen ? 'sidebar-backdrop is-open' : 'sidebar-backdrop'}
          aria-label="关闭导航"
          tabIndex={-1}
          onClick={onClose}
        />
      ) : null}
    </>
  )
}
