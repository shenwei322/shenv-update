import { useCallback, useEffect, useRef, useState } from 'react'
import {
  Check,
  Copy,
  GitBranch,
  KeyRound,
  Lock,
  LogOut,
  Save,
  Workflow,
} from 'lucide-react'
import { api, errorMessage } from '../lib/api'
import type { Channel, Settings } from '../lib/types'
import { isMaskedSecret } from '../lib/format'
import { pulseElement } from '../lib/gsap'
import { copyText } from '../lib/clipboard'
import { toast } from '../lib/toast'
import { Field } from '../components/Field'
import { Segmented } from '../components/Segmented'
import { Skeleton } from '../components/Skeleton'
import { Switch } from '../components/Switch'

interface SettingsPageProps {
  settings: Settings | null
  username: string
  onSaved: (settings: Settings) => void
  onLogout: () => void
}

export function SettingsPage({ settings, username, onSaved, onLogout }: SettingsPageProps) {
  const [local, setLocal] = useState<Settings | null>(settings)
  const [siteName, setSiteName] = useState('')
  const [channel, setChannel] = useState<Channel>('stable')
  const [repo, setRepo] = useState('')
  const [token, setToken] = useState('')
  const [assetPattern, setAssetPattern] = useState('')
  const [autoSync, setAutoSync] = useState(false)
  const [hasToken, setHasToken] = useState(false)

  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [passwordCurrent, setPasswordCurrent] = useState('')
  const [passwordNext, setPasswordNext] = useState('')
  const [passwordConfirm, setPasswordConfirm] = useState('')
  const [passwordSaving, setPasswordSaving] = useState(false)

  const saveButtonRef = useRef<HTMLButtonElement | null>(null)
  const flashTimer = useRef<number | null>(null)
  const logoutTimer = useRef<number | null>(null)

  useEffect(() => {
    return () => {
      if (flashTimer.current !== null) window.clearTimeout(flashTimer.current)
      if (logoutTimer.current !== null) window.clearTimeout(logoutTimer.current)
    }
  }, [])

  useEffect(() => {
    if (settings) setLocal(settings)
  }, [settings])

  useEffect(() => {
    if (!settings && !local) {
      void (async () => {
        try {
          const data = await api.settings.get()
          setLocal(data)
          onSaved(data)
        } catch (caught) {
          toast.error(errorMessage(caught))
        }
      })()
    }
  }, [settings, local, onSaved])

  useEffect(() => {
    if (!local) return
    setSiteName(local.siteName ?? '')
    setChannel(local.channel === 'beta' ? 'beta' : 'stable')
    setRepo(local.github?.repo ?? '')
    setAssetPattern(local.github?.assetPattern ?? '')
    setAutoSync(Boolean(local.github?.autoSync))
    setHasToken(Boolean(local.github?.hasToken))
    setToken('')
  }, [local])

  const secret = local?.cronSecret ?? ''
  const maskedSecret = isMaskedSecret(secret)

  const save = useCallback(async () => {
    if (!siteName.trim()) {
      toast.error('请填写站点名')
      return
    }
    if (repo.trim() && !repo.includes('/')) {
      toast.error('GitHub 仓库格式应为 owner/repo')
      return
    }
    setSaving(true)
    try {
      const updated = await api.settings.save({
        siteName: siteName.trim(),
        channel,
        apiBase: (local?.apiBase ?? '').replace(/\/+$/, ''),
        github: {
          repo: repo.trim(),
          token: token.trim(),
          assetPattern: assetPattern.trim(),
          autoSync,
        },
      })
      setLocal(updated)
      onSaved(updated)
      setToken('')
      toast.success('设置已保存')
      setSaved(true)
      pulseElement(saveButtonRef.current)
      if (flashTimer.current !== null) window.clearTimeout(flashTimer.current)
      flashTimer.current = window.setTimeout(() => {
        setSaved(false)
        flashTimer.current = null
      }, 2000)
    } catch (caught) {
      toast.error(errorMessage(caught))
    } finally {
      setSaving(false)
    }
  }, [assetPattern, autoSync, channel, local, onSaved, repo, siteName, token])

  const copySecret = async () => {
    const ok = await copyText(secret)
    if (ok) toast.success('已复制定时同步密钥')
    else toast.error('复制失败，请手动选择复制')
  }

  const changePassword = async () => {
    if (!passwordCurrent) {
      toast.error('请输入当前密码')
      return
    }
    if (passwordNext.length < 8) {
      toast.error('新密码至少 8 位')
      return
    }
    if (passwordNext !== passwordConfirm) {
      toast.error('两次输入的新密码不一致')
      return
    }
    if (passwordNext === passwordCurrent) {
      toast.error('新密码不能与当前密码相同')
      return
    }
    setPasswordSaving(true)
    try {
      await api.changePassword({ current: passwordCurrent, next: passwordNext })
      setPasswordCurrent('')
      setPasswordNext('')
      setPasswordConfirm('')
      toast.success('密码已修改，请使用新密码重新登录')
      logoutTimer.current = window.setTimeout(() => {
        logoutTimer.current = null
        onLogout()
      }, 900)
    } catch (caught) {
      toast.error(errorMessage(caught))
    } finally {
      setPasswordSaving(false)
    }
  }

  return (
    <div className="page">
      <header className="page-head">
        <p className="page-desc">站点信息、GitHub 同步、定时任务密钥与账号安全。</p>
        <div className="page-actions">
          <button
            type="button"
            ref={saveButtonRef}
            className={saved ? 'btn btn-primary is-saved' : 'btn btn-primary'}
            onClick={() => void save()}
            disabled={saving || !local}
          >
            {saved ? <Check size={16} /> : <Save size={16} />}
            {saving ? '保存中…' : saved ? '已保存' : '保存设置'}
          </button>
        </div>
      </header>

      {!local ? <Skeleton rows={7} /> : null}

      {local ? (
        <>
          <section className="card">
            <div className="card-head">
              <div>
                <h2 className="card-title">站点</h2>
                <p className="card-sub">站点名显示在后台侧栏与登录页</p>
              </div>
            </div>
            <div className="form-grid">
              <Field label="站点名" htmlFor="settings-site">
                <input
                  id="settings-site"
                  className="input"
                  value={siteName}
                  onChange={(event) => setSiteName(event.target.value)}
                  placeholder="Turf Launcher 更新服务"
                />
              </Field>

              <Field label="默认通道">
                <Segmented
                  value={channel}
                  ariaLabel="默认通道"
                  options={[
                    { value: 'stable', label: 'stable' },
                    { value: 'beta', label: 'beta' },
                  ]}
                  onChange={setChannel}
                />
              </Field>

              <Field
                label="API 基地址"
                htmlFor="settings-api"
                className="field-span-2"
                hint="由服务端 PUBLIC_BASE_URL 决定，用于拼接更新接口地址"
              >
                <input
                  id="settings-api"
                  className="input input-mono"
                  value={local.apiBase ?? ''}
                  readOnly
                  placeholder="https://api.shenv.top"
                />
              </Field>
            </div>
          </section>

          <section className="card">
            <div className="card-head">
              <div>
                <h2 className="card-title">
                  <GitBranch size={16} />
                  GitHub 同步
                </h2>
                <p className="card-sub">从 GitHub Releases 拉取版本号、更新说明与下载地址</p>
              </div>
              <span className={hasToken ? 'badge badge-ok' : 'badge badge-muted'}>
                {hasToken ? 'Token 已配置' : '未配置 Token'}
              </span>
            </div>

            <div className="form-grid">
              <Field label="仓库" htmlFor="settings-repo" hint="格式 owner/repo，例如 shenwei322/turf-launcher-web">
                <input
                  id="settings-repo"
                  className="input"
                  value={repo}
                  onChange={(event) => setRepo(event.target.value)}
                  placeholder="owner/repo"
                  spellCheck={false}
                />
              </Field>

              <Field
                label="GitHub Token"
                htmlFor="settings-token"
                hint="仅保存在服务端，不会回传到浏览器；留空表示不修改"
              >
                <input
                  id="settings-token"
                  className="input input-mono"
                  type="password"
                  value={token}
                  autoComplete="off"
                  onChange={(event) => setToken(event.target.value)}
                  placeholder={hasToken ? '已配置，留空不修改' : '未配置，填写后保存'}
                />
              </Field>

              <Field
                label="资产匹配正则"
                htmlFor="settings-pattern"
                className="field-span-2"
                hint="用于从 release 资产中挑选下载包，例如 (setup\.exe|\.msi|\.zip)$"
              >
                <input
                  id="settings-pattern"
                  className="input input-mono"
                  value={assetPattern}
                  onChange={(event) => setAssetPattern(event.target.value)}
                  placeholder="(setup\.exe|\.msi|\.zip)$"
                  spellCheck={false}
                />
              </Field>
            </div>

            <div className="switch-line">
              <span className="switch-control">
                <span className="switch-title">自动同步</span>
                <span className="switch-sub">
                  开启后更新接口会每隔几分钟拉取 latest release，只对来源是 GitHub 的发布生效
                </span>
              </span>
              <Switch checked={autoSync} onChange={setAutoSync} label="自动同步" />
            </div>
          </section>

          <section className="card">
            <div className="card-head">
              <div>
                <h2 className="card-title">
                  <KeyRound size={16} />
                  定时同步密钥
                </h2>
                <p className="card-sub">GitHub Actions 调用 POST /api/cron/sync 时放在 x-cron-secret 头</p>
              </div>
            </div>
            <div className="secret-row">
              <code className="secret-value">{secret || '未配置'}</code>
              <button
                type="button"
                className="btn btn-sm"
                onClick={() => void copySecret()}
                disabled={!secret || maskedSecret}
                title={maskedSecret ? '当前为掩码显示，无法复制明文' : undefined}
              >
                <Copy size={15} />
                复制
              </button>
            </div>
            <p className="field-hint">
              {maskedSecret
                ? '服务端返回的是掩码，真实密钥以部署环境的 CRON_SECRET 为准。'
                : '未配置时可在服务端设置 CRON_SECRET 环境变量，保存后生效。'}
            </p>
          </section>

          <section className="card">
            <div className="card-head">
              <div>
                <h2 className="card-title">
                  <Lock size={16} />
                  修改密码
                </h2>
                <p className="card-sub">当前账号：{username}；改密后所有已签发的 token 立即失效</p>
              </div>
            </div>

            <div className="form-grid">
              <Field label="当前密码" htmlFor="password-current">
                <input
                  id="password-current"
                  className="input"
                  type="password"
                  value={passwordCurrent}
                  autoComplete="current-password"
                  onChange={(event) => setPasswordCurrent(event.target.value)}
                  placeholder="输入当前密码"
                />
              </Field>

              <Field label="新密码" htmlFor="password-next" hint="至少 8 位">
                <input
                  id="password-next"
                  className="input"
                  type="password"
                  value={passwordNext}
                  autoComplete="new-password"
                  onChange={(event) => setPasswordNext(event.target.value)}
                  placeholder="输入新密码"
                />
              </Field>

              <Field label="确认新密码" htmlFor="password-confirm">
                <input
                  id="password-confirm"
                  className="input"
                  type="password"
                  value={passwordConfirm}
                  autoComplete="new-password"
                  onChange={(event) => setPasswordConfirm(event.target.value)}
                  placeholder="再次输入新密码"
                />
              </Field>
            </div>

            <div className="settings-actions">
              <button
                type="button"
                className="btn"
                onClick={() => void changePassword()}
                disabled={passwordSaving}
              >
                {passwordSaving ? '更新中…' : '更新密码'}
              </button>
              <button type="button" className="btn btn-ghost" onClick={onLogout}>
                <LogOut size={16} />
                退出登录
              </button>
            </div>
          </section>

          <section className="card">
            <div className="card-head">
              <div>
                <h2 className="card-title">
                  <Workflow size={16} />
                  部署提示
                </h2>
                <p className="card-sub">上线前需要确认的三件事</p>
              </div>
            </div>
            <ul className="hint-list">
              <li>
                <strong>定时同步</strong>：GitHub Actions 工作流调用 <code>POST /api/cron/sync</code>，请求头需带
                <code>x-cron-secret</code>。
              </li>
              <li>
                <strong>数据存储</strong>：默认写入 <code>data/state.json</code>；配置 <code>STATE_REPO</code> 与
                <code>STATE_TOKEN</code> 后改为写入仓库文件。
              </li>
              <li>
                <strong>静态托管</strong>：<code>admin/dist</code> 由服务端直接托管，更新后重新
                <code>npm run build</code> 即可。
              </li>
            </ul>
          </section>

          <div className="page-foot">
            <span className="field-hint">站点名、通道与 GitHub 配置修改后需要保存才生效。</span>
            <button
              type="button"
              className={saved ? 'btn btn-primary is-saved' : 'btn btn-primary'}
              onClick={() => void save()}
              disabled={saving}
            >
              {saved ? <Check size={16} /> : <Save size={16} />}
              {saving ? '保存中…' : saved ? '已保存' : '保存设置'}
            </button>
          </div>
        </>
      ) : null}
    </div>
  )
}
