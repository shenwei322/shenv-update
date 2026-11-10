import { useCallback, useEffect, useRef, useState } from 'react'
import { CircleAlert, Info, Pencil, Plus, Server, Trash2 } from 'lucide-react'
import { api, errorMessage } from '../lib/api'
import type { Mirror, MirrorInput, MirrorRegion, MirrorScope } from '../lib/types'
import { useStaggerIn } from '../lib/gsap'
import { formatDateTime, isHttpUrl } from '../lib/format'
import { toast } from '../lib/toast'
import { EmptyState } from '../components/EmptyState'
import { Field } from '../components/Field'
import { Modal } from '../components/Modal'
import { ConfirmDialog } from '../components/ConfirmDialog'
import { Segmented } from '../components/Segmented'
import { Skeleton } from '../components/Skeleton'
import { Switch } from '../components/Switch'

interface MirrorsPageProps {
  intent: number | null
}

interface MirrorForm {
  name: string
  url: string
  scope: MirrorScope
  region: MirrorRegion
  enabled: boolean
  sortOrder: string
}

const EMPTY_FORM: MirrorForm = {
  name: '',
  url: '',
  scope: 'update',
  region: 'auto',
  enabled: true,
  sortOrder: '0',
}

const SCOPE_LABELS: Record<MirrorScope, string> = {
  update: '更新包节点',
  game: '游戏下载源',
}

const REGION_LABELS: Record<MirrorRegion, string> = {
  global: '全球',
  cn: '国内',
  auto: '自动',
}

function formFromItem(item: Mirror): MirrorForm {
  return {
    name: item.name,
    url: item.url,
    scope: item.scope === 'game' ? 'game' : 'update',
    region: item.region === 'cn' || item.region === 'global' ? item.region : 'auto',
    enabled: item.enabled,
    sortOrder: String(item.sortOrder ?? 0),
  }
}

function validateForm(form: MirrorForm): string | null {
  if (!form.name.trim()) return '请填写节点名称'
  if (!isHttpUrl(form.url.trim())) return '地址必须是 http(s) 绝对地址'
  if (!/^\d+$/.test(form.sortOrder.trim())) return '排序需要是非负整数'
  return null
}

function toInput(form: MirrorForm): MirrorInput {
  return {
    name: form.name.trim(),
    url: form.url.trim(),
    scope: form.scope,
    region: form.region,
    enabled: form.enabled,
    sortOrder: Number(form.sortOrder.trim() || '0') || 0,
  }
}

export function MirrorsPage({ intent }: MirrorsPageProps) {
  const listRef = useRef<HTMLDivElement | null>(null)
  const [items, setItems] = useState<Mirror[]>([])
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)

  const [editorOpen, setEditorOpen] = useState(false)
  const [editing, setEditing] = useState<Mirror | null>(null)
  const [form, setForm] = useState<MirrorForm>(EMPTY_FORM)
  const [saving, setSaving] = useState(false)

  const [pendingDelete, setPendingDelete] = useState<Mirror | null>(null)
  const [deleting, setDeleting] = useState(false)
  const [togglingId, setTogglingId] = useState<number | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const data = await api.mirrors.list()
      const list = Array.isArray(data.items) ? [...data.items] : []
      list.sort((left, right) => (Number(left.sortOrder) || 0) - (Number(right.sortOrder) || 0))
      setItems(list)
      setLoadError(null)
    } catch (caught) {
      const message = errorMessage(caught)
      setLoadError(message)
      toast.error(message)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  const openCreate = useCallback(() => {
    setEditing(null)
    setForm(EMPTY_FORM)
    setEditorOpen(true)
  }, [])

  useEffect(() => {
    if (intent !== null) openCreate()
  }, [intent, openCreate])

  useStaggerIn(listRef, `${items.length}:${loading}`)

  const openEdit = (item: Mirror) => {
    setEditing(item)
    setForm(formFromItem(item))
    setEditorOpen(true)
  }

  const submit = async () => {
    const message = validateForm(form)
    if (message) {
      toast.error(message)
      return
    }
    setSaving(true)
    try {
      if (editing) {
        await api.mirrors.update(editing.id, toInput(form))
        toast.success('镜像节点已更新')
      } else {
        await api.mirrors.create(toInput(form))
        toast.success('镜像节点已创建')
      }
      setEditorOpen(false)
      await load()
    } catch (caught) {
      toast.error(errorMessage(caught))
    } finally {
      setSaving(false)
    }
  }

  const toggleEnabled = async (item: Mirror) => {
    setTogglingId(item.id)
    try {
      await api.mirrors.update(item.id, {
        name: item.name,
        url: item.url,
        scope: item.scope === 'game' ? 'game' : 'update',
        region: item.region,
        enabled: !item.enabled,
        sortOrder: item.sortOrder,
      })
      toast.success(item.enabled ? '节点已停用' : '节点已启用')
      await load()
    } catch (caught) {
      toast.error(errorMessage(caught))
    } finally {
      setTogglingId(null)
    }
  }

  const confirmDelete = async () => {
    if (!pendingDelete) return
    setDeleting(true)
    try {
      await api.mirrors.remove(pendingDelete.id)
      toast.success('镜像节点已删除')
      setPendingDelete(null)
      await load()
    } catch (caught) {
      toast.error(errorMessage(caught))
    } finally {
      setDeleting(false)
    }
  }

  return (
    <div className="page">
      <header className="page-head">
        <p className="page-desc">镜像节点按「用途 + 排序」参与启动器的下载与资源分发。</p>
        <div className="page-actions">
          <button type="button" className="btn btn-primary" onClick={openCreate}>
            <Plus size={16} />
            新建镜像节点
          </button>
        </div>
      </header>

      <div className="callout">
        <Info size={16} />
        <div>
          <p>
            <strong>update</strong> 节点参与启动器更新下载的候选回退：与 release 自带下载地址合并去重后，按排序逐个尝试。
          </p>
          <p>
            <strong>game</strong> 节点是游戏资源下载源，通过 <code>/api/v1/mirrors?scope=game</code> 下发。
          </p>
        </div>
      </div>

      {loadError && !loading ? (
        <p className="form-error">
          <CircleAlert size={16} />
          {loadError}
        </p>
      ) : null}

      {loading ? <Skeleton rows={5} /> : null}

      {!loading && !items.length ? (
        <EmptyState
          icon={<Server size={22} />}
          title="还没有镜像节点"
          hint="添加更新包节点或游戏下载源，启动器会按排序依次尝试。"
          action={
            <button type="button" className="btn btn-primary" onClick={openCreate}>
              <Plus size={16} />
              新建镜像节点
            </button>
          }
        />
      ) : null}

      <div className="row-list" ref={listRef}>
        {items.map((item) => {
          const scope: MirrorScope = item.scope === 'game' ? 'game' : 'update'
          return (
            <article className="row" key={item.id} data-stagger>
              <div className="row-main">
                <div className="row-title-line">
                  <h3 className="row-title">{item.name}</h3>
                  <span className={scope === 'game' ? 'badge badge-game' : 'badge badge-update'}>
                    {SCOPE_LABELS[scope]}
                  </span>
                  <span className="badge badge-muted">{REGION_LABELS[item.region] ?? '自动'}</span>
                  <span className="badge badge-muted">排序 {item.sortOrder}</span>
                  {!item.enabled ? <span className="badge badge-muted">已停用</span> : null}
                </div>
                <p className="row-sub row-url">{item.url}</p>
                <div className="row-meta">
                  <span>创建 {formatDateTime(item.createdAt)}</span>
                </div>
              </div>
              <div className="row-actions">
                <Switch
                  checked={item.enabled}
                  disabled={togglingId === item.id}
                  onChange={() => void toggleEnabled(item)}
                  label={`启用节点 ${item.name}`}
                />
                <button type="button" className="icon-btn" aria-label="编辑节点" onClick={() => openEdit(item)}>
                  <Pencil size={16} />
                </button>
                <button
                  type="button"
                  className="icon-btn icon-btn-danger"
                  aria-label="删除节点"
                  onClick={() => setPendingDelete(item)}
                >
                  <Trash2 size={16} />
                </button>
              </div>
            </article>
          )
        })}
      </div>

      {editorOpen ? (
        <Modal
          title={editing ? '编辑镜像节点' : '新建镜像节点'}
          subtitle="地址必须是 http(s) 绝对地址"
          icon={<Server size={18} />}
          width={620}
          onClose={() => setEditorOpen(false)}
          footer={
            <>
              <button type="button" className="btn" onClick={() => setEditorOpen(false)} disabled={saving}>
                取消
              </button>
              <button type="button" className="btn btn-primary" onClick={() => void submit()} disabled={saving}>
                {saving ? '保存中…' : '保存节点'}
              </button>
            </>
          }
        >
          <div className="form-grid">
            <Field label="名称" htmlFor="mirror-name">
              <input
                id="mirror-name"
                className="input"
                value={form.name}
                onChange={(event) => setForm((current) => ({ ...current, name: event.target.value }))}
                placeholder="GitHub 官方"
              />
            </Field>

            <Field label="排序" htmlFor="mirror-sort" hint="数字越小越靠前">
              <input
                id="mirror-sort"
                className="input"
                inputMode="numeric"
                value={form.sortOrder}
                onChange={(event) => setForm((current) => ({ ...current, sortOrder: event.target.value }))}
                placeholder="0"
              />
            </Field>

            <Field label="用途" className="field-span-2" hint="update 参与更新下载回退；game 通过接口下发给客户端">
              <Segmented
                value={form.scope}
                ariaLabel="节点用途"
                options={[
                  { value: 'update', label: '更新包节点 update' },
                  { value: 'game', label: '游戏下载源 game' },
                ]}
                onChange={(next) => setForm((current) => ({ ...current, scope: next }))}
              />
            </Field>

            <Field label="地址" htmlFor="mirror-url" className="field-span-2" hint="http:// 或 https:// 开头">
              <input
                id="mirror-url"
                className="input input-mono"
                value={form.url}
                onChange={(event) => setForm((current) => ({ ...current, url: event.target.value }))}
                placeholder="https://cdn.example.com/turf/"
                spellCheck={false}
              />
            </Field>

            <Field label="地区">
              <Segmented
                value={form.region}
                ariaLabel="节点地区"
                options={[
                  { value: 'global', label: '全球' },
                  { value: 'cn', label: '国内' },
                  { value: 'auto', label: '自动' },
                ]}
                onChange={(next) => setForm((current) => ({ ...current, region: next }))}
              />
            </Field>

            <Field label="启用">
              <div className="switch-line">
                <span className="switch-control">
                  <span className="switch-title">启用节点</span>
                  <span className="switch-sub">停用后不参与候选</span>
                </span>
                <Switch
                  checked={form.enabled}
                  onChange={(next) => setForm((current) => ({ ...current, enabled: next }))}
                  label="启用节点"
                />
              </div>
            </Field>
          </div>
        </Modal>
      ) : null}

      {pendingDelete ? (
        <ConfirmDialog
          title="删除镜像节点"
          message={`确定删除「${pendingDelete.name}」？删除后启动器不再尝试该节点。`}
          busy={deleting}
          onCancel={() => setPendingDelete(null)}
          onConfirm={() => void confirmDelete()}
        />
      ) : null}
    </div>
  )
}
