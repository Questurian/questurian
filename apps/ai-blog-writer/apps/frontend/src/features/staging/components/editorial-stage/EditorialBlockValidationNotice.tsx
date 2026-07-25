import type { EditorialBlockCardOptions } from './editorial-block-card.types'

type EditorialBlockValidationNoticeProps = Pick<
  EditorialBlockCardOptions,
  'validation' | 'onFixBlock' | 'disableFix'
>

export function EditorialBlockValidationNotice({
  validation,
  onFixBlock,
  disableFix,
}: EditorialBlockValidationNoticeProps) {
  if (!validation) return null

  if (validation.status === 'supported') {
    return (
      <div
        style={{
          marginBottom: '0.6rem',
          padding: '0.45rem 0.6rem',
          borderRadius: '8px',
          background: 'rgba(52, 119, 83, 0.12)',
          color: '#2e6f4f',
          fontSize: '0.82rem',
        }}
      >
        Mapped to Payload as <code>{validation.mappedPayloadBlockType}</code>.
      </div>
    )
  }

  if (validation.status === 'unsupported') {
    return (
      <div
        style={{
          marginBottom: '0.6rem',
          padding: '0.45rem 0.6rem',
          borderRadius: '8px',
          background: 'rgba(188, 120, 0, 0.12)',
          color: '#7f4f00',
          fontSize: '0.82rem',
        }}
      >
        {validation.message}
      </div>
    )
  }

  return (
    <div
      style={{
        marginBottom: '0.6rem',
        padding: '0.55rem 0.6rem',
        borderRadius: '8px',
        background: 'rgba(175, 52, 52, 0.12)',
        color: '#852f2f',
        fontSize: '0.82rem',
      }}
    >
      <div style={{ marginBottom: '0.45rem' }}>
        {validation.message}
      </div>
      {onFixBlock && (
        <button
          type="button"
          onClick={onFixBlock}
          disabled={disableFix}
          style={{
            border: '1px solid rgba(133, 47, 47, 0.4)',
            background: '#fff',
            color: '#852f2f',
            borderRadius: '999px',
            padding: '0.3rem 0.65rem',
            fontSize: '0.78rem',
            cursor: disableFix ? 'not-allowed' : 'pointer',
            opacity: disableFix ? 0.6 : 1,
          }}
        >
          Fix block
        </button>
      )}
    </div>
  )
}
