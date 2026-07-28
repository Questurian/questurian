import type { ToolbarAction, ToolbarActionKey } from '../types'

type EditorToolbarProps = {
  blockId: string
  actions: ToolbarAction[]
  activeKeys: ReadonlySet<ToolbarActionKey>
  onAction: (key: ToolbarActionKey) => void
}

export function EditorToolbar({ blockId, actions, activeKeys, onAction }: EditorToolbarProps) {
  return (
    <div className="block-markdown-toolbar">
      {actions.map((action) => {
        const isActive = action.isToggle === true && activeKeys.has(action.key)
        return (
          <button
            key={`${blockId}_${action.key}`}
            type="button"
            className={`block-markdown-toolbar-btn${isActive ? ' is-active' : ''}`}
            aria-pressed={action.isToggle === true ? isActive : undefined}
            onMouseDown={(event) => event.preventDefault()}
            onClick={() => onAction(action.key)}
            title={action.title}
          >
            {action.label}
          </button>
        )
      })}
    </div>
  )
}
