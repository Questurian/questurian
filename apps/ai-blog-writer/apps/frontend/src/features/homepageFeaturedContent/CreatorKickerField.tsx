import { useEffect, useState } from 'react'
import { useMutation } from '@tanstack/react-query'

const CREATOR_KICKER_MAX_LENGTH = 80

type Props = {
  blockId: string
  creatorKicker: string | null | undefined
  saveCreatorKicker?: (value: string | null) => Promise<void>
}

export default function CreatorKickerField({
  blockId,
  creatorKicker,
  saveCreatorKicker,
}: Props) {
  const savedValue = creatorKicker ?? ''
  const [draft, setDraft] = useState(savedValue)

  useEffect(() => {
    setDraft(savedValue)
  }, [blockId, savedValue])

  const trimmed = draft.trim()
  const dirty = trimmed !== savedValue.trim()
  const mutation = useMutation({
    mutationFn: async (value: string | null) => {
      if (saveCreatorKicker) await saveCreatorKicker(value)
    },
  })

  if (!saveCreatorKicker) return null

  return (
    <section className="hf-block-settings-section">
      <h3 className="hf-block-settings-kicker">Creator label</h3>
      <p className="hf-block-settings-hint">
        Optional colored line shown directly above the creator portrait.
      </p>
      <label className="hf-sr-only" htmlFor={`hf-creator-kicker-${blockId}`}>
        Creator label
      </label>
      <input
        id={`hf-creator-kicker-${blockId}`}
        type="text"
        className="hf-block-section-heading-input"
        maxLength={CREATOR_KICKER_MAX_LENGTH}
        placeholder="e.g. Your Lima insider"
        value={draft}
        onChange={(event) => setDraft(event.target.value)}
        disabled={mutation.isPending}
        autoComplete="off"
      />
      <div className="hf-block-section-heading-row">
        <button
          type="button"
          className="hf-btn-ghost"
          disabled={!dirty || mutation.isPending}
          onClick={() => setDraft(savedValue)}
        >
          Reset
        </button>
        <button
          type="button"
          className="hf-btn-primary"
          disabled={!dirty || mutation.isPending}
          onClick={() => mutation.mutate(trimmed || null)}
        >
          {mutation.isPending ? 'Saving…' : 'Save label'}
        </button>
      </div>
      {mutation.isError ? (
        <p className="hf-block-section-heading-error">
          {mutation.error instanceof Error ? mutation.error.message : 'Failed to save label.'}
        </p>
      ) : null}
    </section>
  )
}
