import type { ReactNode } from 'react'

type MarkdownBlock =
  | { type: 'heading'; level: number; text: string }
  | { type: 'paragraph'; text: string }
  | { type: 'list'; ordered: boolean; items: string[] }
  | { type: 'code'; lang: string; code: string }
  | { type: 'divider' }

const INLINE_PATTERN = /(`[^`]+`)|(\*\*[^*]+\*\*)|(\[[^\]]*\]\((?:https?:\/\/|mailto:)[^\s)]*\))/
const LINK_PATTERN = /^\[([^\]]*)\]\(([^)]+)\)$/

function renderInline(text: string, prefix: string): ReactNode[] {
  const nodes: ReactNode[] = []
  const pattern = new RegExp(INLINE_PATTERN.source, 'g')
  let cursor = 0
  let key = 0
  let match: RegExpExecArray | null = pattern.exec(text)

  while (match !== null) {
    if (match.index > cursor) nodes.push(text.slice(cursor, match.index))
    const token = match[0]

    if (token.startsWith('`')) {
      nodes.push(<code key={`${prefix}-code-${key++}`}>{token.slice(1, -1)}</code>)
    } else if (token.startsWith('**')) {
      nodes.push(<strong key={`${prefix}-bold-${key++}`}>{token.slice(2, -2)}</strong>)
    } else {
      const link = LINK_PATTERN.exec(token)
      if (link) {
        const label = link[1].trim() || link[2]
        nodes.push(
          <a key={`${prefix}-link-${key++}`} href={link[2]} target="_blank" rel="noreferrer noopener">
            {label}
          </a>,
        )
      } else {
        nodes.push(token)
      }
    }

    cursor = match.index + token.length
    match = pattern.exec(text)
  }

  if (cursor < text.length) nodes.push(text.slice(cursor))
  return nodes
}

export function parseMarkdown(source: string): MarkdownBlock[] {
  const lines = source.replace(/\r\n?/g, '\n').split('\n')
  const blocks: MarkdownBlock[] = []
  let paragraph: string[] = []
  let index = 0

  const flushParagraph = () => {
    if (!paragraph.length) return
    blocks.push({ type: 'paragraph', text: paragraph.join(' ') })
    paragraph = []
  }

  while (index < lines.length) {
    const line = lines[index]
    const trimmed = line.trim()

    if (!trimmed) {
      flushParagraph()
      index += 1
      continue
    }

    const fence = /^```(\S*)\s*$/.exec(trimmed)
    if (fence) {
      flushParagraph()
      const codeLines: string[] = []
      index += 1
      while (index < lines.length && !/^```\s*$/.test(lines[index].trim())) {
        codeLines.push(lines[index])
        index += 1
      }
      if (index < lines.length) index += 1
      blocks.push({ type: 'code', lang: fence[1] ?? '', code: codeLines.join('\n') })
      continue
    }

    const heading = /^(#{1,6})\s+(.*)$/.exec(trimmed)
    if (heading) {
      flushParagraph()
      blocks.push({ type: 'heading', level: heading[1].length, text: heading[2].trim() })
      index += 1
      continue
    }

    if (/^(-{3,}|\*{3,}|_{3,})$/.test(trimmed)) {
      flushParagraph()
      blocks.push({ type: 'divider' })
      index += 1
      continue
    }

    const orderedMatch = /^\s*\d+\.\s+(.*)$/.exec(line)
    const bulletMatch = /^\s*[-*+]\s+(.*)$/.exec(line)
    if (orderedMatch || bulletMatch) {
      flushParagraph()
      const ordered = Boolean(orderedMatch)
      const items: string[] = []
      while (index < lines.length) {
        const current = lines[index]
        const orderedItem = /^\s*\d+\.\s+(.*)$/.exec(current)
        const bulletItem = /^\s*[-*+]\s+(.*)$/.exec(current)
        if (ordered && orderedItem) {
          items.push(orderedItem[1])
          index += 1
          continue
        }
        if (!ordered && bulletItem) {
          items.push(bulletItem[1])
          index += 1
          continue
        }
        break
      }
      blocks.push({ type: 'list', ordered, items })
      continue
    }

    paragraph.push(trimmed)
    index += 1
  }

  flushParagraph()
  return blocks
}

export function renderMarkdown(source: string): ReactNode[] {
  return parseMarkdown(source).map((block, index) => {
    const key = `block-${index}`
    switch (block.type) {
      case 'heading': {
        const Tag = block.level <= 2 ? 'h2' : block.level === 3 ? 'h3' : 'h4'
        return <Tag key={key}>{renderInline(block.text, key)}</Tag>
      }
      case 'paragraph':
        return <p key={key}>{renderInline(block.text, key)}</p>
      case 'list': {
        const items = block.items.map((item, itemIndex) => (
          <li key={`${key}-item-${itemIndex}`}>{renderInline(item, `${key}-${itemIndex}`)}</li>
        ))
        return block.ordered ? <ol key={key}>{items}</ol> : <ul key={key}>{items}</ul>
      }
      case 'code':
        return (
          <pre key={key}>
            <code className={block.lang ? `language-${block.lang}` : undefined}>{block.code}</code>
          </pre>
        )
      case 'divider':
        return <hr key={key} />
      default:
        return null
    }
  })
}
