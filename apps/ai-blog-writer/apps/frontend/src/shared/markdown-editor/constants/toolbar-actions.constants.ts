import type { ToolbarAction } from '../types'

export const BASE_TOOLBAR_ACTIONS: ToolbarAction[] = [
  { key: 'paragraph', label: 'Normal', title: 'Normal text', isToggle: true },
  { key: 'h2', label: 'H2', title: 'Heading 2', isToggle: true },
  { key: 'h3', label: 'H3', title: 'Heading 3', isToggle: true },
  { key: 'bullets', label: 'Bullets', title: 'Toggle bullet list', isToggle: true },
  { key: 'numbered', label: 'Numbered', title: 'Toggle numbered list', isToggle: true },
  { key: 'quote', label: 'Quote', title: 'Toggle blockquote', isToggle: true },
  { key: 'bold', label: 'Bold', title: 'Bold', isToggle: true },
  { key: 'italic', label: 'Italic', title: 'Italic', isToggle: true },
  { key: 'link', label: 'Link', title: 'Insert link' },
]
