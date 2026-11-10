import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react'
import {
  ArrowRight,
  CircleAlert,
  Clock,
  CloudUpload,
  Download,
  GitBranch,
  Megaphone,
  Plus,
  RefreshCw,
  Rocket,
  Server,
  TriangleAlert,
} from 'lucide-react'
import { api, errorMessage } from '../lib/api'
import type { Overview, PageId } from '../lib/types'
import { useStaggerIn } from '../lib/gsap'
import { formatBytes, formatDateTime, formatRelative, summarize } from '../lib/format'
import { toast } from '../lib/toast'
import { CountUp } from '../components/CountUp'
import { ActivityChart } from '../components/ActivityChart'
import { EmptyState } from '../components/EmptyState'
import { Skeleton } from '../components/Skeleton'

interface OverviewPageProps {
  onNavigate: (page: PageId, action?: 'create') => void
}

function StatCard({ icon, label, value, hint }: { icon: ReactNode; label: string; value: number; hint: string }) {
  return (
    <article className="stat-card" data-stagger>
      <span className="stat-icon">{icon}</span>
      <div className="stat-body">
        <span className="stat-label">{label}</span>
        <strong className="stat-value">
          <CountUp value={value} />
        </strong>
        <span className="stat-hint">{hint}</span>
      </div>
    </article>
  )
}

export function OverviewPage({ onNavigate }: OverviewPageProps) {
  const scopeRef = useRef<HTMLDivElement | null>(null)
  const [overview, setOverview] = useState<Overview | null>(null)
  const [loading, setLoading] = useState(true)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const data = await api.overview()
      setOverview(data)
    } catch (caught) {
      toast.error(errorMessage(caught))
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  useStaggerIn(scopeRef, overview ? 'ready' : 'empty')

  const release = overview?.release
  const github = overview?.github
  const series = overview?.stats.series ?? []

  return (
    <div className="page" ref={scopeRef}>
      <header className="page-head">
        <p className="page-desc">更新服务的实时状态与快捷入口。</p>
        <div className="page-actions">
          <button type="button" className="btn btn-sm" onClick={() => void load()} disabled={loading}>
            <RefreshCw size={15} />
            刷新
          </button>
        </div>
      </header>

      {loading && !overview ? <Skeleton rows={7} /> : null}

      {!loading && !overview ? (
        <EmptyState
          icon={<CircleAlert size={22} />}
          title="概览数据加载失败"
          hint="检查服务是否已启动，或稍后重试。"
          action={
            <button type="button" className="btn" onClick={() => void load()}>
              重新加载
            </button>
          }
        />
      ) : null}

      {overview ? (
        <>
          <section className="stats-grid">
            <StatCard
              icon={<Download size={18} />}
              label="更新检查次数"
              value={overview.stats.updateChecks}
              hint={`最近 ${formatRelative(overview.stats.lastUpdateCheckAt)}`}
            />
            <StatCard
              icon={<Rocket size={18} />}
              label="启动次数"
              value={overview.stats.launches}
              hint={`最近 ${formatRelative(overview.stats.lastLaunchAt)}`}
            />
            <StatCard
              icon={<Megaphone size={18} />}
              label="公告数"
              value={overview.counts.announcements}
              hint="含已停用与已过期"
            />
            <StatCard
              icon={<Server size={18} />}
              label="镜像数"
              value={overview.counts.mirrors}
              hint="更新节点与游戏下载源"
            />
          </section>

          <section className="card" data-stagger>
            <div className="card-head">
              <div>
                <h2 className="card-title">最近 14 天</h2>
                <p className="card-sub">更新检查与启动次数，悬停查看每日数值</p>
              </div>
            </div>
            <ActivityChart series={series} />
          </section>

          <div className="dash-split">
            <section className="card" data-stagger>
              <div className="card-head">
                <div>
                  <h2 className="card-title">当前发布</h2>
                  <p className="card-sub">启动器检查更新时返回的版本</p>
                </div>
                <span className="badge badge-channel">{release?.channel === 'beta' ? 'Beta' : 'Stable'}</span>
              </div>

              <div className="release-line">
                <strong className="release-version">{release?.version || '未发布'}</strong>
                {release?.force ? (
                  <span className="badge badge-danger">
                    <TriangleAlert size={12} />
                    强制更新
                  </span>
                ) : (
                  <span className="badge badge-muted">可选更新</span>
                )}
                {release ? (
                  <span className="badge badge-muted">{release.packageType === 'installer' ? '安装包' : '便携版'}</span>
                ) : null}
              </div>

              <p className="release-title">{release?.title || '还没有发布任何版本'}</p>
              <p className="release-notes">
                {release ? summarize(release.notes, 140) : '在更新推送页填写版本信息后即可发布。'}
              </p>

              <div className="release-meta">
                <span>
                  <Clock size={13} />
                  {formatDateTime(release?.publishedAt ?? 0)}
                </span>
                <span>
                  <Download size={13} />
                  {formatBytes(release?.size ?? 0)}
                </span>
              </div>

              <button type="button" className="btn btn-primary" onClick={() => onNavigate('release')}>
                <ArrowRight size={16} />
                去更新推送
              </button>
            </section>

            <section className="card" data-stagger>
              <div className="card-head">
                <div>
                  <h2 className="card-title">
                    <GitBranch size={16} />
                    GitHub 同步
                  </h2>
                  <p className="card-sub">Release 拉取状态</p>
                </div>
                <span className={github?.autoSync ? 'badge badge-ok' : 'badge badge-muted'}>
                  {github?.autoSync ? '自动同步已开启' : '自动同步已关闭'}
                </span>
              </div>

              <dl className="kv">
                <div>
                  <dt>仓库</dt>
                  <dd>{github?.repo || '未配置'}</dd>
                </div>
                <div>
                  <dt>上次同步</dt>
                  <dd>{github?.lastAt ? formatDateTime(github.lastAt) : '暂无记录'}</dd>
                </div>
                <div>
                  <dt>上次 tag</dt>
                  <dd>{github?.lastTag || '—'}</dd>
                </div>
              </dl>

              {github?.lastError ? (
                <p className="inline-error">
                  <CircleAlert size={14} />
                  {github.lastError}
                </p>
              ) : null}
            </section>
          </div>

          <section className="card quick-card" data-stagger>
            <div className="card-head">
              <div>
                <h2 className="card-title">快捷操作</h2>
                <p className="card-sub">常用入口</p>
              </div>
            </div>
            <div className="quick-grid">
              <button type="button" className="quick-action" onClick={() => onNavigate('release')}>
                <span className="quick-icon">
                  <CloudUpload size={18} />
                </span>
                <span className="quick-text">
                  <strong>发布更新</strong>
                  <em>编辑版本与下载信息</em>
                </span>
                <ArrowRight size={16} className="quick-arrow" />
              </button>
              <button
                type="button"
                className="quick-action"
                onClick={() => onNavigate('announcements', 'create')}
              >
                <span className="quick-icon">
                  <Megaphone size={18} />
                </span>
                <span className="quick-text">
                  <strong>写公告</strong>
                  <em>推送到启动器客户端</em>
                </span>
                <ArrowRight size={16} className="quick-arrow" />
              </button>
              <button type="button" className="quick-action" onClick={() => onNavigate('mirrors', 'create')}>
                <span className="quick-icon">
                  <Plus size={18} />
                </span>
                <span className="quick-text">
                  <strong>添加镜像</strong>
                  <em>更新节点或游戏下载源</em>
                </span>
                <ArrowRight size={16} className="quick-arrow" />
              </button>
            </div>
          </section>
        </>
      ) : null}
    </div>
  )
}
