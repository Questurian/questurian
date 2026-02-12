function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

function normalizeText(value: string): string {
  return value.replace(/\u00a0/g, ' ')
}

function normalizeLinkHref(href: string): string {
  const trimmed = href.trim()
  if (!trimmed) return ''
  if (/^(https?:\/\/|mailto:|tel:|\/)/i.test(trimmed)) return trimmed
  return `https://${trimmed.replace(/^\/+/, '')}`
}

function renderInlineMarkdown(rawText: string): string {
  const text = escapeHtml(rawText)

  const withLinks = text.replace(
    /\[([^\]]+)\]\(([^)\s]+)\)/g,
    (_match, label: string, href: string) => {
      const safeHref = normalizeLinkHref(href)
      if (!safeHref) return label
      return `<a href="${escapeHtml(safeHref)}">${label}</a>`
    }
  )

  const withBold = withLinks.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
  const withItalic = withBold.replace(/\*([^*]+)\*/g, '<em>$1</em>')
  const withCode = withItalic.replace(/`([^`]+)`/g, '<code>$1</code>')
  return withCode
}

function isBlockStarter(line: string): boolean {
  const trimmed = line.trimStart()
  return (
    /^(#{1,6})\s+/.test(trimmed)
    || /^>\s?/.test(trimmed)
    || /^[-*+]\s+/.test(trimmed)
    || /^\d+\.\s+/.test(trimmed)
  )
}

export function markdownToEditorHtml(markdown: string): string {
  const lines = markdown.replace(/\r\n/g, '\n').split('\n')
  const blocks: string[] = []
  let index = 0

  while (index < lines.length) {
    const line = lines[index]

    if (!line.trim()) {
      index += 1
      continue
    }

    const headingMatch = line.match(/^(#{1,6})\s+(.*)$/)
    if (headingMatch) {
      const level = headingMatch[1].length
      blocks.push(`<h${level}>${renderInlineMarkdown(headingMatch[2])}</h${level}>`)
      index += 1
      continue
    }

    if (/^\s*>\s?/.test(line)) {
      const quoteLines: string[] = []
      while (index < lines.length && /^\s*>\s?/.test(lines[index])) {
        quoteLines.push(lines[index].replace(/^\s*>\s?/, ''))
        index += 1
      }
      blocks.push(
        `<blockquote>${quoteLines.map(renderInlineMarkdown).join('<br>')}</blockquote>`
      )
      continue
    }

    if (/^\s*[-*+]\s+/.test(line)) {
      const items: string[] = []
      while (index < lines.length && /^\s*[-*+]\s+/.test(lines[index])) {
        items.push(lines[index].replace(/^\s*[-*+]\s+/, ''))
        index += 1
      }
      blocks.push(
        `<ul>${items.map((item) => `<li>${renderInlineMarkdown(item)}</li>`).join('')}</ul>`
      )
      continue
    }

    if (/^\s*\d+\.\s+/.test(line)) {
      const items: string[] = []
      while (index < lines.length && /^\s*\d+\.\s+/.test(lines[index])) {
        items.push(lines[index].replace(/^\s*\d+\.\s+/, ''))
        index += 1
      }
      blocks.push(
        `<ol>${items.map((item) => `<li>${renderInlineMarkdown(item)}</li>`).join('')}</ol>`
      )
      continue
    }

    const paragraphLines: string[] = [line]
    index += 1
    while (
      index < lines.length
      && lines[index].trim() !== ''
      && !isBlockStarter(lines[index])
    ) {
      paragraphLines.push(lines[index])
      index += 1
    }
    blocks.push(`<p>${paragraphLines.map(renderInlineMarkdown).join('<br>')}</p>`)
  }

  if (!blocks.length) {
    return '<p><br></p>'
  }

  return blocks.join('')
}

function serializeInlineNode(node: Node): string {
  if (node.nodeType === Node.TEXT_NODE) {
    return normalizeText(node.textContent || '')
  }

  if (node.nodeType !== Node.ELEMENT_NODE) {
    return ''
  }

  const element = node as HTMLElement
  const tag = element.tagName.toUpperCase()
  const children = Array.from(element.childNodes).map(serializeInlineNode).join('')

  switch (tag) {
    case 'BR':
      return '\n'
    case 'STRONG':
    case 'B':
      return `**${children}**`
    case 'EM':
    case 'I':
      return `*${children}*`
    case 'CODE':
      return `\`${children}\``
    case 'A': {
      const href = element.getAttribute('href') || ''
      const label = children || href
      if (!href) return label
      return `[${label}](${href})`
    }
    default:
      return children
  }
}

function serializeList(listElement: HTMLElement, ordered: boolean): string {
  const items = Array.from(listElement.children)
    .filter((child): child is HTMLElement => child.tagName.toUpperCase() === 'LI')
    .map((item, index) => {
      const text = Array.from(item.childNodes).map(serializeInlineNode).join('').trim()
      if (ordered) {
        return `${index + 1}. ${text}`
      }
      return `- ${text}`
    })
    .filter((line) => line.trim().length > 0)

  return items.join('\n')
}

function serializeBlockNode(node: Node): string | null {
  if (node.nodeType === Node.TEXT_NODE) {
    const text = normalizeText(node.textContent || '').trim()
    return text || null
  }

  if (node.nodeType !== Node.ELEMENT_NODE) {
    return null
  }

  const element = node as HTMLElement
  const tag = element.tagName.toUpperCase()

  if (tag === 'UL') {
    const content = serializeList(element, false)
    return content || null
  }

  if (tag === 'OL') {
    const content = serializeList(element, true)
    return content || null
  }

  if (tag === 'BLOCKQUOTE') {
    const quoteText = Array.from(element.childNodes).map(serializeInlineNode).join('').trim()
    if (!quoteText) return null
    return quoteText.split('\n').map((line) => `> ${line}`).join('\n')
  }

  if (/^H[1-6]$/.test(tag)) {
    const level = Number(tag.slice(1))
    const headingText = Array.from(element.childNodes).map(serializeInlineNode).join('').trim()
    return headingText ? `${'#'.repeat(level)} ${headingText}` : null
  }

  if (tag === 'P' || tag === 'DIV') {
    const content = Array.from(element.childNodes)
      .map(serializeInlineNode)
      .join('')
      .replace(/\n{3,}/g, '\n\n')
      .trim()
    return content || null
  }

  const nestedBlocks = Array.from(element.childNodes)
    .map(serializeBlockNode)
    .filter((entry): entry is string => Boolean(entry && entry.trim().length > 0))
  if (nestedBlocks.length > 0) {
    return nestedBlocks.join('\n\n')
  }

  const inlineContent = Array.from(element.childNodes)
    .map(serializeInlineNode)
    .join('')
    .trim()

  return inlineContent || null
}

export function editorElementToMarkdown(editorElement: HTMLElement): string {
  const blocks = Array.from(editorElement.childNodes)
    .map(serializeBlockNode)
    .filter((entry): entry is string => Boolean(entry && entry.trim().length > 0))
    .map((entry) => entry.replace(/[ \t]+\n/g, '\n').trimEnd())

  return blocks.join('\n\n').replace(/\n{3,}/g, '\n\n').trim()
}

export function normalizeLinkUrl(input: string): string {
  return normalizeLinkHref(input)
}
