import { useCallback, useEffect, useRef, useState } from 'react'
import {
  CircleAlert,
  Clock,
  Megaphone,
  Pencil,
  Pin,
  Plus,
  Trash2,
} from 'lucide-react'
import { api, errorMessage } from '../lib/api'
import type { Announcement, AnnouncementInput, AnnouncementLevel } from '../lib/types'
import { useStaggerIn } from '../lib/gsap'
import { formatDateTime, fromDateTimeInput, summarize, toDateTimeInput } from '../lib/format'
import { toast } from '../lib/toast'
import { EmptyState } from '../components/EmptyState'
import { Field } from '../components/Field'
import { MarkdownPreview } from '../components/MarkdownPreview'
import { Modal } from '../components/Modal'
import { ConfirmDialog } from '../components/ConfirmDialog'
import { Segmented } from '../components/Segmented'
import { Skeleton } from '../components/Skeleton'
import { Switch } from '../components/Switch'

interface AnnouncementsPageProps {
  intent: number | null
}

interface AnnouncementForm {
  title: string
  content: string
  level: AnnouncementLevel
  pinned: boolean
  enabled: boolean
  expiresAt: string
}

const EMPTY_FORM: AnnouncementForm = {
  title: '',
  content: '',
  level: 'info',
  pinned: false,
  enabled: true,
  expiresAt: '',
}

const LEVEL_LABELS: Record<AnnouncementLevel, string> = {
  info: '普通',
  warning: '警告',
  important: '重要',
}

function formFromItem(item: Announcement): AnnouncementForm {
  return {
    title: item.title,
    content: item.content,
    level: item.level,
    pinned: item.pinned,
    enabled: item.enabled,
    expiresAt: toDateTimeInput(item.expiresAt),
  }
}

function toInput(form: AnnouncementForm): AnnouncementInput {
  return {
    title: form.title.trim(),
    content: form.content,
    level: form.level,
    pinned: form.pinned,
    enabled: form.enabled,
    expiresAt: fromDateTimeInput(form.expiresAt),
  }
}

export function AnnouncementsPage({ intent }: AnnouncementsPageProps) {
  const listRef = useRef<HTMLDivElement | null>(null)
  const [items, setItems] = useState<Announcement[]>([])
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)

  const [editorOpen, setEditorOpen] = useState(false)
  const [editing, setEditing] = useState<Announcement | null>(null)
  const [form, setForm] = useState<AnnouncementForm>(EMPTY_FORM)
  const [saving, setSaving] = useState(false)

  const [pendingDelete, setPendingDelete] = useState<Announcement | null>(null)
  const [deleting, setDeleting] = useState(false)
  const [togglingId, setTogglingId] = useState<number | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const data = await api.announcements.list()
      setItems(Array.isArray(data.items) ? data.items : [])
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

  const openEdit = (item: Announcement) => {
    setEditing(item)
    setForm(formFromItem(item))
    setEditorOpen(true)
  }

  const submit = async () => {
    if (!form.title.trim()) {
      toast.error('请填写公告标题')
      return
    }
    setSaving(true)
    try {
      if (editing) {
        await api.announcements.update(editing.id, toInput(form))
        toast.success('公告已更新')
      } else {
        await api.announcements.create(toInput(form))
        toast.success('公告已创建')
      }
      setEditorOpen(false)
      await load()
    } catch (caught) {
      toast.error(errorMessage(caught))
    } finally {
      setSaving(false)
    }
  }

  const toggleEnabled = async (item: Announcement) => {
    setTogglingId(item.id)
    try {
      await api.announcements.update(item.id, {
        title: item.title,
        content: item.content,
        pinned: item.pinned,
        level: item.level,
        enabled: !item.enabled,
        expiresAt: item.expiresAt,
      })
      toast.success(item.enabled ? '公告已停用' : '公告已启用')
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
      await api.announcements.remove(pendingDelete.id)
      toast.success('公告已删除')
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
        <p className="page-desc">公告会出现在启动器公告列表；停用或过期的公告不再下发。</p>
        <div className="page-actions">
          <button type="button" className="btn btn-primary" onClick={openCreate}>
            <Plus size={16} />
            新建公告
          </button>
        </div>
      </header>

      {loadError && !loading ? (
        <p className="form-error">
          <CircleAlert size={16} />
          {loadError}
        </p>
      ) : null}

      {loading ? <Skeleton rows={5} /> : null}

      {!loading && !items.length ? (
        <EmptyState
          icon={<Megaphone size={22} />}
          title="还没有公告"
          hint="发布一条公告，启动器下次启动时即可看到。"
          action={
            <button type="button" className="btn btn-primary" onClick={openCreate}>
              <Plus size={16} />
              新建公告
            </button>
          }
        />
      ) : null}

      <div className="row-list" ref={listRef}>
        {items.map((item) => (
          <article className="row" key={item.id} data-stagger>
            <div className="row-main">
              <div className="row-title-line">
                {item.pinned ? (
                  <span className="badge badge-pin">
                    <Pin size={12} />
                    置顶
                  </span>
                ) : null}
                <h3 className="row-title">{item.title}</h3>
                <span className={`badge badge-${item.level}`}>{LEVEL_LABELS[item.level]}</span>
                {!item.enabled ? <span className="badge badge-muted">已停用</span> : null}
              </div>
              <p className="row-sub">{summarize(item.content, 90)}</p>
              <div className="row-meta">
                <span>
                  <Clock size={13} />
                  创建 {formatDateTime(item.createdAt)}
                </span>
                <span>{item.expiresAt ? `过期 ${formatDateTime(item.expiresAt)}` : '永不过期'}</span>
              </div>
            </div>
            <div className="row-actions">
              <Switch
                checked={item.enabled}
                disabled={togglingId === item.id}
                onChange={() => void toggleEnabled(item)}
                label={`启用公告 ${item.title}`}
              />
              <button type="button" className="icon-btn" aria-label="编辑公告" onClick={() => openEdit(item)}>
                <Pencil size={16} />
              </button>
              <button
                type="button"
                className="icon-btn icon-btn-danger"
                aria-label="删除公告"
                onClick={() => setPendingDelete(item)}
              >
                <Trash2 size={16} />
              </button>
            </div>
          </article>
        ))}
      </div>

      {editorOpen ? (
        <Modal
          title={editing ? '编辑公告' : '新建公告'}
          subtitle="内容支持 Markdown，会原样推送到启动器渲染"
          icon={<Megaphone size={18} />}
          width={760}
          onClose={() => setEditorOpen(false)}
          footer={
            <>
              <button type="button" className="btn" onClick={() => setEditorOpen(false)} disabled={saving}>
                取消
              </button>
              <button type="button" className="btn btn-primary" onClick={() => void submit()} disabled={saving}>
                {saving ? '保存中…' : '保存公告'}
              </button>
            </>
          }
        >
          <div className="form-grid">
            <Field label="标题" htmlFor="ann-title" className="field-span-2">
              <input
                id="ann-title"
                className="input"
                value={form.title}
                onChange={(event) => setForm((current) => ({ ...current, title: event.target.value }))}
                placeholder="例如：0.2.1 版本更新公告"
              />
            </Field>

            <Field label="级别">
              <Segmented
                value={form.level}
                ariaLabel="公告级别"
                options={[
                  { value: 'info', label: '普通' },
                  { value: 'warning', label: '警告' },
                  { value: 'important', label: '重要' },
                ]}
                onChange={(next) => setForm((current) => ({ ...current, level: next }))}
              />
            </Field>

            <Field label="过期时间" htmlFor="ann-expires" hint="留空表示永久有效">
              <input
                id="ann-expires"
                className="input"
                type="datetime-local"
                value={form.expiresAt}
                onChange={(event) => setForm((current) => ({ ...current, expiresAt: event.target.value }))}
              />
            </Field>
          </div>

          <div className="switch-row">
            <div className="switch-line">
              <span className="switch-control">
                <span className="switch-title">置顶</span>
                <span className="switch-sub">在启动器公告列表顶部显示</span>
              </span>
              <Switch
                checked={form.pinned}
                onChange={(next) => setForm((current) => ({ ...current, pinned: next }))}
                label="置顶公告"
              />
            </div>
            <div className="switch-line">
              <span className="switch-control">
                <span className="switch-title">启用</span>
                <span className="switch-sub">停用后不会下发给启动器</span>
              </span>
              <Switch
                checked={form.enabled}
                onChange={(next) => setForm((current) => ({ ...current, enabled: next }))}
                label="启用公告"
              />
            </div>
          </div>

          <Field label="内容（Markdown）" hint="支持标题、列表、粗体、行内代码、代码块、链接与分隔线">
            <div className="md-split md-split-sm">
              <textarea
                className="textarea textarea-code"
                value={form.content}
                rows={10}
                spellCheck={false}
                onChange={(event) => setForm((current) => ({ ...current, content: event.target.value }))}
                placeholder={'## 公告标题\n\n- 第一条内容\n- 第二条内容'}
              />
              <MarkdownPreview source={form.content} emptyText="左侧输入 Markdown，右侧实时预览" />
            </div>
          </Field>
        </Modal>
      ) : null}

      {pendingDelete ? (
        <ConfirmDialog
          title="删除公告"
          message={`确定删除「${pendingDelete.title}」？删除后启动器将不再收到该公告。`}
          busy={deleting}
          onCancel={() => setPendingDelete(null)}
          onConfirm={() => void confirmDelete()}
        />
      ) : null}
    </div>
  )
}
