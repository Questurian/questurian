import type { ToolbarAction, ToolbarActionKey } from '../types'

type EditorToolbarProps = {
  blockId: string
  actions: ToolbarAction[]
  onAction: (key: ToolbarActionKey) => void
}

export function EditorToolbar({ blockId, actions, onAction }: EditorToolbarProps) {
  return (
    <div className="block-markdown-toolbar">
      {actions.map((action) => (
        <button
          key={`${blockId}_${action.key}`}
          type="button"
          className="block-markdown-toolbar-btn"
          onMouseDown={(event) => event.preventDefault()}
          onClick={() => onAction(action.key)}
          title={action.title}
        >
          {action.label}
        </button>
      ))}
    </div>
  )
}
