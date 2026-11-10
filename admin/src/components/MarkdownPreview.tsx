import { useMemo } from 'react'
import { renderMarkdown } from '../lib/markdown'

interface MarkdownPreviewProps {
  source: string
  emptyText?: string
  className?: string
}

export function MarkdownPreview({ source, emptyText = '暂无内容', className }: MarkdownPreviewProps) {
  const nodes = useMemo(() => renderMarkdown(source), [source])
  return (
    <div className={className ? `md ${className}` : 'md'}>
      {nodes.length ? nodes : <p className="md-empty">{emptyText}</p>}
    </div>
  )
}
