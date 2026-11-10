import { useCallback, useEffect, useRef, useState } from 'react'
import { api, ApiError, errorMessage, getToken, setToken, setUnauthorizedHandler } from './lib/api'
import type { PageId, Session, Settings } from './lib/types'
import { usePageEnter } from './lib/gsap'
import { useMediaQuery } from './lib/hooks'
import { toast } from './lib/toast'
import { Sidebar } from './components/Sidebar'
import { Topbar } from './components/Topbar'
import { ToastHost } from './components/Toast'
import { Skeleton } from './components/Skeleton'
import { LoginPage } from './pages/LoginPage'
import { OverviewPage } from './pages/OverviewPage'
import { ReleasePage } from './pages/ReleasePage'
import { AnnouncementsPage } from './pages/AnnouncementsPage'
import { MirrorsPage } from './pages/MirrorsPage'
import { SettingsPage } from './pages/SettingsPage'

const PAGE_TITLES: Record<PageId, string> = {
  overview: '概览',
  release: '更新推送',
  announcements: '公告',
  mirrors: '镜像节点',
  settings: '设置',
}

const DEFAULT_SITE_NAME = 'Turf Launcher 更新服务'
const DEFAULT_API_BASE = 'https://api.shenv.top'

interface NavIntent {
  page: PageId
  action: 'create'
  key: number
}

export default function App() {
  const [token, setTokenState] = useState<string | null>(() => getToken())
  const [session, setSession] = useState<Session | null>(null)
  const [settings, setSettings] = useState<Settings | null>(null)
  const [booting, setBooting] = useState<boolean>(() => Boolean(getToken()))
  const [page, setPage] = useState<PageId>('overview')
  const [intent, setIntent] = useState<NavIntent | null>(null)
  const [drawerOpen, setDrawerOpen] = useState(false)
  const [collapsed, setCollapsed] = useState<boolean>(() => {
    try {
      return window.localStorage.getItem('shenv.admin.collapsed') === '1'
    } catch {
      return false
    }
  })

  const wide = useMediaQuery('(min-width: 1100px)')
  const pageRef = useRef<HTMLDivElement | null>(null)

  usePageEnter(pageRef, `${page}:${booting}:${token ? 'in' : 'out'}`)

  useEffect(() => {
    setUnauthorizedHandler(() => {
      setTokenState(null)
      setSession(null)
      setSettings(null)
      setBooting(false)
      toast.error('登录状态已失效，请重新登录')
    })
    return () => setUnauthorizedHandler(null)
  }, [])

  useEffect(() => {
    if (wide) setDrawerOpen(false)
  }, [wide])

  useEffect(() => {
    try {
      window.localStorage.setItem('shenv.admin.collapsed', collapsed ? '1' : '0')
    } catch {
      /* localStorage 不可用时仅当前标签页生效 */
    }
  }, [collapsed])

  useEffect(() => {
    if (!token) return
    let cancelled = false
    setBooting(true)
    void (async () => {
      try {
        const [currentSession, currentSettings] = await Promise.all([api.session(), api.settings.get()])
        if (cancelled) return
        setSession(currentSession)
        setSettings(currentSettings)
      } catch (caught) {
        if (cancelled) return
        if (caught instanceof ApiError && caught.status === 401) return
        toast.error(errorMessage(caught))
      } finally {
        if (!cancelled) setBooting(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [token])

  const handleLogin = useCallback((result: { token: string; username: string }) => {
    setToken(result.token)
    setTokenState(result.token)
    setSession({ username: result.username, expiresAt: 0 })
    setPage('overview')
    setIntent(null)
    setBooting(true)
    toast.success('登录成功')
  }, [])

  const handleLogout = useCallback(() => {
    setToken(null)
    setTokenState(null)
    setSession(null)
    setSettings(null)
    setBooting(false)
    setPage('overview')
    setIntent(null)
    setDrawerOpen(false)
  }, [])

  const navigate = useCallback((next: PageId, action?: 'create') => {
    setPage(next)
    setIntent(action ? { page: next, action, key: Date.now() } : null)
    setDrawerOpen(false)
    window.scrollTo(0, 0)
  }, [])

  const apiBase = settings?.apiBase || DEFAULT_API_BASE
  const siteName = settings?.siteName || DEFAULT_SITE_NAME
  const username = session?.username || 'admin'

  const renderPage = () => {
    switch (page) {
      case 'overview':
        return <OverviewPage onNavigate={navigate} />
      case 'release':
        return (
          <ReleasePage
            apiBase={apiBase}
            repo={settings?.github.repo ?? ''}
            defaultPattern={settings?.github.assetPattern ?? ''}
          />
        )
      case 'announcements':
        return <AnnouncementsPage intent={intent?.page === 'announcements' ? intent.key : null} />
      case 'mirrors':
        return <MirrorsPage intent={intent?.page === 'mirrors' ? intent.key : null} />
      case 'settings':
        return (
          <SettingsPage
            settings={settings}
            username={username}
            onSaved={setSettings}
            onLogout={handleLogout}
          />
        )
      default:
        return null
    }
  }

  if (!token) {
    return (
      <>
        <LoginPage siteName={siteName} onSuccess={handleLogin} />
        <ToastHost />
      </>
    )
  }

  return (
    <>
      <div className="app-shell">
        <Sidebar
          siteName={siteName}
          username={username}
          page={page}
          wide={wide}
          collapsed={collapsed}
          mobileOpen={drawerOpen}
          onNavigate={navigate}
          onClose={() => setDrawerOpen(false)}
          onLogout={handleLogout}
        />
        <div className="app-main">
          <Topbar
            title={PAGE_TITLES[page]}
            apiBase={apiBase}
            wide={wide}
            collapsed={collapsed}
            onToggleCollapse={() => setCollapsed((value) => !value)}
            onOpenDrawer={() => setDrawerOpen(true)}
          />
          <main className="app-content">
            <div className="page-body" ref={pageRef}>
              {booting ? <Skeleton rows={7} /> : renderPage()}
            </div>
          </main>
        </div>
      </div>
      <ToastHost />
    </>
  )
}
