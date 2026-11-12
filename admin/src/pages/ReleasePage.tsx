import { useCallback, useEffect, useRef, useState } from 'react'
import {
  ArrowRight,
  Check,
  ChevronLeft,
  CircleAlert,
  GitBranch,
  RefreshCw,
  Save,
  TriangleAlert,
} from 'lucide-react'
import { api, ApiError, errorMessage } from '../lib/api'
import type {
  Channel,
  GithubReleaseItem,
  GithubState,
  GithubSyncResult,
  PackageType,
  Release,
  ReleaseInput,
  ReleaseSource,
} from '../lib/types'
import { formatBytes, formatDateTime, isHttpUrl, isValidVersion, normalizeVersion, summarize } from '../lib/format'
import { pulseElement } from '../lib/gsap'
import { toast } from '../lib/toast'
import { Field } from '../components/Field'
import { Segmented } from '../components/Segmented'
import { MarkdownPreview } from '../components/MarkdownPreview'
import { Skeleton } from '../components/Skeleton'
import { Switch } from '../components/Switch'

interface ReleasePageProps {
  repo: string
  defaultPattern: string
}

interface ReleaseForm {
  version: string
  title: string
  notes: string
  force: boolean
  channel: Channel
  packageType: PackageType
  downloadUrl: string
  sha256: string
  size: string
  releaseUrl: string
  minSupported: string
  source: ReleaseSource
  coverImage: string
}

const EMPTY_FORM: ReleaseForm = {
  version: '',
  title: '',
  notes: '',
  force: false,
  channel: 'stable',
  packageType: 'portable',
  downloadUrl: '',
  sha256: '',
  size: '',
  releaseUrl: '',
  minSupported: '0.0.0',
  source: 'manual',
  coverImage: '',
}

function formFromRelease(release: Release): ReleaseForm {
  return {
    version: release.version ?? '',
    title: release.title ?? '',
    notes: release.notes ?? '',
    force: Boolean(release.force),
    channel: release.channel === 'beta' ? 'beta' : 'stable',
    packageType: release.packageType === 'installer' ? 'installer' : 'portable',
    downloadUrl: release.downloadUrl ?? '',
    sha256: String(release.sha256 ?? '').toLowerCase(),
    size: release.size ? String(release.size) : '',
    releaseUrl: release.releaseUrl ?? '',
    minSupported: release.minSupported || '0.0.0',
    source: release.source === 'github' ? 'github' : 'manual',
    coverImage: release.coverImage ?? '',
  }
}

function validateForm(form: ReleaseForm): string | null {
  if (!isValidVersion(form.version)) return '版本号格式不正确，例如 0.2.1 或 0.2.1-beta.1'
  if (!form.title.trim()) return '请填写版本标题'
  if (form.downloadUrl.trim() && !isHttpUrl(form.downloadUrl.trim())) {
    return '下载地址必须是 http(s) 绝对地址'
  }
  if (form.releaseUrl.trim() && !isHttpUrl(form.releaseUrl.trim())) {
    return '发布页地址必须是 http(s) 绝对地址'
  }
  if (form.coverImage.trim() && !isHttpUrl(form.coverImage.trim())) {
    return '封面图必须是 http(s) 图片地址'
  }
  const sha = form.sha256.trim()
  if (sha && !/^[0-9a-fA-F]{64}$/.test(sha)) return 'SHA256 需要 64 位十六进制字符'
  if (form.size.trim() && !/^\d+$/.test(form.size.trim())) return '文件大小需要填写字节数（非负整数）'
  if (form.minSupported.trim() && !isValidVersion(form.minSupported)) {
    return '最低支持版本格式不正确'
  }
  return null
}

function toPayload(form: ReleaseForm): ReleaseInput {
  return {
    version: normalizeVersion(form.version),
    title: form.title.trim(),
    notes: form.notes,
    force: form.force,
    channel: form.channel,
    packageType: form.packageType,
    downloadUrl: form.downloadUrl.trim(),
    sha256: form.sha256.trim().toLowerCase(),
    size: Number(form.size.trim() || '0') || 0,
    releaseUrl: form.releaseUrl.trim(),
    minSupported: form.minSupported.trim() ? normalizeVersion(form.minSupported) : '0.0.0',
    source: form.source,
    coverImage: form.coverImage.trim(),
  }
}

export function ReleasePage({ repo, defaultPattern }: ReleasePageProps) {
  const [form, setForm] = useState<ReleaseForm>(EMPTY_FORM)
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [github, setGithub] = useState<GithubState | null>(null)
  const [syncTag, setSyncTag] = useState('')
  const [syncPattern, setSyncPattern] = useState(defaultPattern)
  const [syncing, setSyncing] = useState(false)
  const [syncingTag, setSyncingTag] = useState('')
  const [syncResult, setSyncResult] = useState<GithubSyncResult | null>(null)
  const [githubReleases, setGithubReleases] = useState<GithubReleaseItem[]>([])
  const [releasesLoading, setReleasesLoading] = useState(false)
  const [releasesError, setReleasesError] = useState<string | null>(null)
  const [currentRelease, setCurrentRelease] = useState<Release | null>(null)
  const [mode, setMode] = useState<'list' | 'publish'>('list')

  const saveButtonRef = useRef<HTMLButtonElement | null>(null)
  const previewRef = useRef<HTMLDivElement | null>(null)
  const flashTimer = useRef<number | null>(null)

  useEffect(() => {
    return () => {
      if (flashTimer.current !== null) window.clearTimeout(flashTimer.current)
    }
  }, [])

  useEffect(() => {
    if (!defaultPattern) return
    setSyncPattern((current) => current || defaultPattern)
  }, [defaultPattern])

  const load = useCallback(async (quiet = false) => {
    if (!quiet) setLoading(true)
    try {
      const release = await api.release.get()
      setCurrentRelease(release)
      setForm(formFromRelease(release))
      setLoadError(null)
    } catch (caught) {
      if (caught instanceof ApiError && caught.status === 404) {
        setCurrentRelease(null)
        setForm(EMPTY_FORM)
        setLoadError(null)
        if (!quiet) toast.info('还没有发布任何版本，填写后保存即可')
      } else {
        const message = errorMessage(caught)
        setLoadError(message)
        toast.error(message)
      }
    } finally {
      if (!quiet) setLoading(false)
    }

    try {
      const overview = await api.overview()
      setGithub(overview.github)
    } catch {
      /* 概览失败不影响发布表单，页面仍可保存 */
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  const loadGithubReleases = useCallback(async () => {
    if (!repo) {
      setGithubReleases([])
      setReleasesError('请先在设置页填写 GitHub 仓库 owner/repo')
      return
    }
    setReleasesLoading(true)
    setReleasesError(null)
    try {
      const data = await api.release.githubReleases(20)
      setGithubReleases(data.items)
    } catch (caught) {
      setGithubReleases([])
      setReleasesError(errorMessage(caught))
    } finally {
      setReleasesLoading(false)
    }
  }, [repo])

  useEffect(() => {
    void loadGithubReleases()
  }, [loadGithubReleases])

  function setField<K extends keyof ReleaseForm>(key: K, value: ReleaseForm[K]): void {
    setForm((current) => ({ ...current, [key]: value }))
  }

  const save = async () => {
    const message = validateForm(form)
    if (message) {
      toast.error(message)
      return
    }
    setSaving(true)
    try {
      await api.release.save(toPayload(form))
      toast.success('发布信息已保存')
      setSaved(true)
      pulseElement(saveButtonRef.current)
      if (flashTimer.current !== null) window.clearTimeout(flashTimer.current)
      flashTimer.current = window.setTimeout(() => {
        setSaved(false)
        flashTimer.current = null
      }, 2000)
      await load(true)
      setMode('list')
    } catch (caught) {
      toast.error(errorMessage(caught))
    } finally {
      setSaving(false)
    }
  }

  const runSync = async (tagOverride?: string) => {
    const tag = (tagOverride ?? syncTag).trim()
    setSyncing(true)
    setSyncingTag(tag)
    try {
      const input: { tag?: string; pattern?: string } = {}
      if (tag) input.tag = tag
      if (syncPattern.trim()) input.pattern = syncPattern.trim()
      const result = await api.release.syncGithub(input)
      setSyncResult(result)
      window.setTimeout(() => {
        previewRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' })
      }, 80)
      toast.success(result.message || '已从 GitHub 拉取 release 预览')
    } catch (caught) {
      toast.error(errorMessage(caught))
    } finally {
      setSyncing(false)
      setSyncingTag('')
    }
  }

  const startPublish = (tag?: string) => {
    setMode('publish')
    if (tag) {
      setSyncTag(tag)
      void runSync(tag)
    }
  }

  const applyPreview = () => {
    if (!syncResult) return
    const preview = syncResult.release
    setForm((current) => ({
      ...current,
      version: preview.version ? normalizeVersion(preview.version) : current.version,
      title: preview.title || current.title,
      notes: preview.notes || current.notes,
      downloadUrl: preview.downloadUrl || current.downloadUrl,
      sha256: preview.sha256 ? String(preview.sha256).toLowerCase() : current.sha256,
      size: preview.size ? String(preview.size) : current.size,
      releaseUrl: preview.releaseUrl || current.releaseUrl,
      channel: preview.channel === 'beta' ? 'beta' : current.channel,
      packageType: preview.packageType === 'installer' ? 'installer' : 'portable',
      minSupported: preview.minSupported || current.minSupported,
      coverImage: preview.coverImage || current.coverImage,
      // 让后端保留 GitHub 来源，自动同步才不会被手写发布覆盖。
      source: 'github',
    }))
    toast.info('已填入表单，确认无误后点「保存发布」')
  }

  return (
    <div className="page">
      <header className="page-head">
        <p className="page-desc">
          {mode === 'list'
            ? '查看当前线上版本与 GitHub Release，点击版本或「发布更新」进入发布内容。'
            : '填写发布内容；强制更新开启后，启动器不显示「跳过此版本」按钮。'}
        </p>
        <div className="page-actions">
          {mode === 'list' ? (
            <button type="button" className="btn btn-primary" onClick={() => startPublish()}>
              <Save size={16} />
              发布更新
            </button>
          ) : (
            <>
              <button type="button" className="btn" onClick={() => setMode('list')}>
                <ChevronLeft size={16} />
                返回列表
              </button>
              <button
                type="button"
                ref={saveButtonRef}
                className={saved ? 'btn btn-primary is-saved' : 'btn btn-primary'}
                onClick={() => void save()}
                disabled={saving || loading}
              >
                {saved ? <Check size={16} /> : <Save size={16} />}
                {saving ? '发布中…' : saved ? '已发布' : '保存发布'}
              </button>
            </>
          )}
        </div>
      </header>

      {loadError ? (
        <p className="form-error">
          <CircleAlert size={16} />
          {loadError}
        </p>
      ) : null}

      {loading ? <Skeleton rows={8} /> : null}

      {mode === 'list' ? (
        <>
          <section className="card">
            <div className="card-head">
              <div>
                <h2 className="card-title">
                  <GitBranch size={16} />
                  当前线上版本
                </h2>
                <p className="card-sub">启动器下一次检查更新会读取这里的内容</p>
              </div>
              {currentRelease ? (
                <span className="badge badge-ok">v{currentRelease.version}</span>
              ) : null}
            </div>
            {currentRelease ? (
              <div className="release-current">
                <strong>v{currentRelease.version}</strong>
                <span className="release-current-title">{currentRelease.title}</span>
                <span className="release-current-meta">
                  {formatDateTime(currentRelease.publishedAt)} · {currentRelease.packageType}
                </span>
                {currentRelease.force ? <span className="badge badge-warn">强制更新</span> : null}
              </div>
            ) : (
              <div className="empty">
                <p className="empty-title">还没有发布版本</p>
                <p className="empty-hint">点右上角「发布更新」填写发布内容。</p>
              </div>
            )}
          </section>

          <section className="card gh-card">
            <div className="card-head">
              <div>
                <h2 className="card-title">
                  <GitBranch size={16} />
                  更新推送列表
                </h2>
                <p className="card-sub">
                  当前仓库：{repo || '未配置，请先在设置页填写 GitHub repo'}
                </p>
              </div>
          <div className="gh-actions">
            <span className={github?.autoSync ? 'badge badge-ok' : 'badge badge-muted'}>
              {github?.autoSync ? '自动同步已开启' : '自动同步已关闭'}
            </span>
            <button
              type="button"
              className="btn btn-sm"
              onClick={() => void loadGithubReleases()}
              disabled={releasesLoading}
            >
              <RefreshCw size={15} />
              刷新列表
            </button>
          </div>
        </div>

        {releasesLoading ? (
          <Skeleton rows={3} />
        ) : releasesError ? (
          <p className="inline-error">
            <CircleAlert size={14} />
            {releasesError}
          </p>
        ) : githubReleases.length === 0 ? (
          <div className="empty">
            <p className="empty-title">暂无 GitHub Release</p>
            <p className="empty-hint">当前仓库还没有发布 Release，或仓库地址不正确。</p>
          </div>
        ) : (
          <div className="gh-release-list">
            {githubReleases.map((item) => (
              <article
                key={item.tag || item.name}
                className={syncTag === item.tag ? 'gh-release is-active' : 'gh-release'}
              >
                <button
                  type="button"
                  className="gh-release-main"
                  onClick={() => startPublish(item.tag)}
                  disabled={syncing}
                >
                  <span className="gh-release-copy">
                    <span className="gh-release-top">
                      <strong>{item.tag || '无 tag'}</strong>
                      {item.prerelease ? <span className="badge badge-warn">预发布</span> : null}
                      {item.draft ? <span className="badge badge-muted">草稿</span> : null}
                    </span>
                    <span className="gh-release-name">{item.name || '未命名 Release'}</span>
                    <span className="gh-release-meta">
                      {formatDateTime(item.publishedAt)} · {item.assets.length} 个资产
                    </span>
                  </span>
                  <span className="gh-release-side">
                    {syncingTag === item.tag ? '拉取中…' : <ArrowRight size={16} />}
                  </span>
                </button>
              </article>
            ))}
          </div>
        )}
      </section>
        </>
      ) : (
        <>
      <section className="card">
        <div className="card-head">
          <div>
            <h2 className="card-title">
              <GitBranch size={16} />
              拉取与预览
            </h2>
            <p className="card-sub">
              当前仓库：{repo || '未配置，请先在设置页填写 GitHub repo'}
            </p>
          </div>
          <span className={github?.autoSync ? 'badge badge-ok' : 'badge badge-muted'}>
            {github?.autoSync ? '自动同步已开启' : '自动同步已关闭'}
          </span>
        </div>

        <div className="form-grid">
          <Field label="Tag" htmlFor="sync-tag" hint="留空表示取 latest release">
            <input
              id="sync-tag"
              className="input"
              value={syncTag}
              onChange={(event) => setSyncTag(event.target.value)}
              placeholder="v0.2.1（可留空）"
              spellCheck={false}
            />
          </Field>

          <Field label="资产匹配正则" htmlFor="sync-pattern" hint="例如 (?i)(setup\.exe|\.msi|\.zip)$">
            <input
              id="sync-pattern"
              className="input input-mono"
              value={syncPattern}
              onChange={(event) => setSyncPattern(event.target.value)}
              placeholder="(?i)(setup\.exe|\.msi|\.zip)$"
              spellCheck={false}
            />
          </Field>
        </div>

        <div className="sync-actions">
          <button type="button" className="btn" onClick={() => void runSync()} disabled={syncing}>
            <RefreshCw size={16} />
            {syncing ? '拉取中…' : '从 GitHub 拉取'}
          </button>
          <span className="field-hint">只生成预览，不会直接覆盖当前发布；确认后再保存。</span>
        </div>

        {syncResult ? (
          <div className="sync-result" ref={previewRef}>
            <div className="sync-result-head">
              <span className={syncResult.matched ? 'badge badge-ok' : 'badge badge-warn'}>
                {syncResult.matched ? '已命中资产正则' : '未命中正则，使用回退资产'}
              </span>
              <span className="sync-message">{syncResult.message}</span>
            </div>
            <dl className="kv">
              <div>
                <dt>资产</dt>
                <dd>{syncResult.asset?.name || '—'}</dd>
              </div>
              <div>
                <dt>大小</dt>
                <dd>{formatBytes(syncResult.asset?.size ?? 0)}</dd>
              </div>
              <div>
                <dt>版本</dt>
                <dd>{syncResult.release.version || '—'}</dd>
              </div>
              <div>
                <dt>说明摘要</dt>
                <dd>{summarize(syncResult.release.notes, 90)}</dd>
              </div>
            </dl>
            <button type="button" className="btn btn-primary" onClick={applyPreview}>
              <ArrowRight size={16} />
              填入表单
            </button>
          </div>
        ) : null}

        <dl className="kv kv-inline">
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

      <form
        className="release-form"
        onSubmit={(event) => {
          event.preventDefault()
          void save()
        }}
      >
        <section className="card">
          <div className="card-head">
            <div>
              <h2 className="card-title">版本信息</h2>
              <p className="card-sub">版本号会直接参与启动器的版本比较</p>
            </div>
          </div>

          <div className="form-grid">
            <Field label="版本号" htmlFor="release-version" hint="例如 0.2.1，可带 -beta.1 后缀">
              <input
                id="release-version"
                className="input"
                value={form.version}
                onChange={(event) => setField('version', event.target.value)}
                placeholder="0.2.1"
                spellCheck={false}
              />
            </Field>

            <Field label="标题" htmlFor="release-title" hint="启动器更新弹窗的标题">
              <input
                id="release-title"
                className="input"
                value={form.title}
                onChange={(event) => setField('title', event.target.value)}
                placeholder="Turf Launcher 0.2.1"
              />
            </Field>

            <Field label="通道" hint="stable 为默认通道，beta 供测试版本使用">
              <Segmented
                value={form.channel}
                ariaLabel="发布通道"
                options={[
                  { value: 'stable', label: 'stable' },
                  { value: 'beta', label: 'beta' },
                ]}
                onChange={(next) => setField('channel', next)}
              />
            </Field>

            <Field label="包类型" hint="portable 直接替换启动器；installer 运行安装包后启动">
              <Segmented
                value={form.packageType}
                ariaLabel="包类型"
                options={[
                  { value: 'portable', label: 'portable' },
                  { value: 'installer', label: 'installer' },
                ]}
                onChange={(next) => setField('packageType', next)}
              />
            </Field>

            <Field
              label="最低支持版本"
              htmlFor="release-min"
              hint="客户端版本低于该值时同样强制更新，0.0.0 表示不限制"
            >
              <input
                id="release-min"
                className="input"
                value={form.minSupported}
                onChange={(event) => setField('minSupported', event.target.value)}
                placeholder="0.0.0"
                spellCheck={false}
              />
            </Field>
          </div>

          <div className="force-row">
            <div className="switch-line">
              <span className="switch-control">
                <span className="switch-title">强制更新</span>
                <span className="switch-sub">开启后启动器不显示「跳过此版本」</span>
              </span>
              <Switch
                checked={form.force}
                onChange={(next) => setField('force', next)}
                label="强制更新"
              />
            </div>
            {form.force ? (
              <p className="inline-warn">
                <TriangleAlert size={14} />
                当前为强制更新：用户必须升级后才能继续使用启动器。
              </p>
            ) : null}
          </div>
        </section>

        <section className="card">
          <div className="card-head">
            <div>
              <h2 className="card-title">更新说明</h2>
              <p className="card-sub">支持 Markdown，右侧实时预览</p>
            </div>
          </div>

          <div className="md-split">
            <textarea
              className="textarea textarea-code"
              value={form.notes}
              rows={14}
              spellCheck={false}
              onChange={(event) => setField('notes', event.target.value)}
              placeholder={'## 更新内容\n\n- 修复启动器自动更新失败的问题\n- 优化下载速度'}
            />
            <MarkdownPreview source={form.notes} emptyText="左侧输入 Markdown，右侧实时预览" />
          </div>
        </section>

        <section className="card">
          <div className="card-head">
            <div>
              <h2 className="card-title">下载信息</h2>
              <p className="card-sub">下载地址会与镜像节点合并后逐个尝试</p>
            </div>
          </div>

          <div className="form-grid">
            <Field
              label="下载地址"
              htmlFor="release-download"
              className="field-span-2"
              hint="https:// 或 http:// 绝对地址，GitHub Release 资产直链即可"
            >
              <input
                id="release-download"
                className="input"
                value={form.downloadUrl}
                onChange={(event) => setField('downloadUrl', event.target.value)}
                placeholder="https://github.com/owner/repo/releases/download/v0.2.1/Turf.Launcher.exe"
                spellCheck={false}
              />
            </Field>

            <Field
              label="SHA256"
              htmlFor="release-sha"
              className="field-span-2"
              hint="64 位十六进制，可留空；填写后启动器会校验下载文件"
            >
              <input
                id="release-sha"
                className="input input-mono"
                value={form.sha256}
                onChange={(event) => setField('sha256', event.target.value)}
                placeholder="留空表示不校验"
                spellCheck={false}
              />
            </Field>

            <Field
              label="文件大小（字节）"
              htmlFor="release-size"
              hint={`人类可读：${formatBytes(Number(form.size.trim() || '0') || 0)}`}
            >
              <input
                id="release-size"
                className="input"
                inputMode="numeric"
                value={form.size}
                onChange={(event) => setField('size', event.target.value)}
                placeholder="12345678"
              />
            </Field>

            <Field
              label="发布页 URL"
              htmlFor="release-url"
              hint="更新弹窗里的「查看完整更新」链接"
            >
              <input
                id="release-url"
                className="input"
                value={form.releaseUrl}
                onChange={(event) => setField('releaseUrl', event.target.value)}
                placeholder="https://github.com/owner/repo/releases/tag/v0.2.1"
                spellCheck={false}
              />
            </Field>

            <Field
              label="封面图 URL"
              htmlFor="release-cover"
              className="field-span-2"
              hint="显示在启动器更新弹窗顶部，可填 GitHub 图片或 CDN 直链"
            >
              <input
                id="release-cover"
                className="input"
                value={form.coverImage}
                onChange={(event) => setField('coverImage', event.target.value)}
                placeholder="https://example.com/update-cover.png"
                spellCheck={false}
              />
            </Field>

            {form.coverImage.trim() ? (
              <div className="release-cover-preview field-span-2">
                <img src={form.coverImage} alt="更新封面预览" />
              </div>
            ) : null}
          </div>
        </section>
      </form>

      <div className="page-foot">
        <span className="field-hint">保存后启动器下一次检查更新即可拿到新版本。</span>
        <button
          type="button"
          className={saved ? 'btn btn-primary is-saved' : 'btn btn-primary'}
          onClick={() => void save()}
          disabled={saving || loading}
        >
          {saved ? <Check size={16} /> : <Save size={16} />}
          {saving ? '保存中…' : saved ? '已保存' : '保存发布'}
        </button>
      </div>
        </>
      )}
    </div>
  )
}
