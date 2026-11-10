const DATE_TIME_FORMATTER = new Intl.DateTimeFormat('zh-CN', {
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  hour12: false,
})

const MINUTE = 60_000
const HOUR = 60 * MINUTE
const DAY = 24 * HOUR

export function formatDateTime(value: number): string {
  if (!value || !Number.isFinite(value)) return '—'
  return DATE_TIME_FORMATTER.format(new Date(value)).replace(/\//g, '-')
}

export function formatRelative(value: number): string {
  if (!value || !Number.isFinite(value)) return '暂无记录'
  const diff = Date.now() - value
  if (diff < 0) return formatDateTime(value)
  if (diff < MINUTE) return '刚刚'
  if (diff < HOUR) return `${Math.floor(diff / MINUTE)} 分钟前`
  if (diff < DAY) return `${Math.floor(diff / HOUR)} 小时前`
  if (diff < 30 * DAY) return `${Math.floor(diff / DAY)} 天前`
  return formatDateTime(value)
}

export function formatCount(value: number): string {
  if (!Number.isFinite(value)) return '0'
  return Math.round(value).toLocaleString('zh-CN')
}

export function formatBytes(value: number): string {
  if (!Number.isFinite(value) || value <= 0) return '0 B'
  const units = ['B', 'KB', 'MB', 'GB', 'TB']
  let size = value
  let index = 0
  while (size >= 1024 && index < units.length - 1) {
    size /= 1024
    index += 1
  }
  const digits = index === 0 || size >= 100 ? 0 : size >= 10 ? 1 : 2
  return `${size.toFixed(digits)} ${units[index]}`
}

export function formatDay(day: string): string {
  return day.length >= 10 ? day.slice(5) : day
}

export function toDateTimeInput(value: number): string {
  if (!value || !Number.isFinite(value)) return ''
  const date = new Date(value)
  const pad = (input: number) => String(input).padStart(2, '0')
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`
}

export function fromDateTimeInput(value: string): number {
  if (!value) return 0
  const time = new Date(value).getTime()
  return Number.isFinite(time) ? time : 0
}

export function stripMarkdown(source: string): string {
  return source
    .replace(/```[\s\S]*?```/g, ' ')
    .replace(/`([^`]*)`/g, '$1')
    .replace(/!\[[^\]]*\]\([^)]*\)/g, ' ')
    .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/^#{1,6}\s*/gm, '')
    .replace(/[*_~>#]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
}

export function summarize(source: string, max = 120): string {
  const text = stripMarkdown(source)
  if (!text) return '暂无更新说明'
  return text.length > max ? `${text.slice(0, max)}…` : text
}

export function isHttpUrl(value: string): boolean {
  try {
    const url = new URL(value)
    return url.protocol === 'http:' || url.protocol === 'https:'
  } catch {
    return false
  }
}

const VERSION_PATTERN = /^\d+(\.\d+){0,3}(-[0-9A-Za-z.-]+)?$/

export function normalizeVersion(value: string): string {
  return value.trim().replace(/^v/i, '')
}

export function isValidVersion(value: string): boolean {
  return VERSION_PATTERN.test(normalizeVersion(value))
}

export function isMaskedSecret(value: string): boolean {
  return value.length > 0 && /^\*+$/.test(value)
}
