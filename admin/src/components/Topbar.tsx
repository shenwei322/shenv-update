import { Menu, PanelLeftClose, PanelLeftOpen } from 'lucide-react'

interface TopbarProps {
  title: string
  wide: boolean
  collapsed: boolean
  onToggleCollapse: () => void
  onOpenDrawer: () => void
}

export function Topbar({
  title,
  wide,
  collapsed,
  onToggleCollapse,
  onOpenDrawer,
}: TopbarProps) {
  return (
    <header className="topbar">
      <div className="topbar-left">
        {wide ? (
          <button
            type="button"
            className="icon-btn"
            aria-label={collapsed ? '展开侧栏' : '收起侧栏'}
            title={collapsed ? '展开侧栏' : '收起侧栏'}
            onClick={onToggleCollapse}
          >
            {collapsed ? <PanelLeftOpen size={19} /> : <PanelLeftClose size={19} />}
          </button>
        ) : (
          <button type="button" className="icon-btn" aria-label="打开导航" onClick={onOpenDrawer}>
            <Menu size={20} />
          </button>
        )}
        <h1 className="topbar-title">{title}</h1>
      </div>
      <div className="topbar-right">
        <span className="status">
          <span className="status-dot" aria-hidden="true" />
          在线
        </span>
      </div>
    </header>
  )
}
