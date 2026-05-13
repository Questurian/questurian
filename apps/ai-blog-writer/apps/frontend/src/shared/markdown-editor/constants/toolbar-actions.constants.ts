import type { ToolbarAction } from '../types'

export const BASE_TOOLBAR_ACTIONS: ToolbarAction[] = [
  { key: 'h2', label: 'H2', title: 'Heading 2' },
  { key: 'h3', label: 'H3', title: 'Heading 3' },
  { key: 'bullets', label: 'Bullets', title: 'Toggle bullet list' },
  { key: 'numbered', label: 'Numbered', title: 'Toggle numbered list' },
  { key: 'quote', label: 'Quote', title: 'Toggle blockquote' },
  { key: 'bold', label: 'Bold', title: 'Bold' },
  { key: 'italic', label: 'Italic', title: 'Italic' },
  { key: 'link', label: 'Link', title: 'Insert link' },
]
