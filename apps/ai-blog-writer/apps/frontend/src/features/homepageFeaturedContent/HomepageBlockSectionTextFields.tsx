import { useEffect, useRef, useState } from 'react'
import { useMutation } from '@tanstack/react-query'

const SECTION_HEADING_MAX_LEN = 120
const SECTION_SUBHEADING_MAX_LEN = 200

type Props = {
  blockId: string
  /** Saved values from the server (react to block identity + refetch). */
  sectionHeading: string | null | undefined
  sectionSubheading: string | null | undefined
  /** When the modal opens, focus the heading field. */
  settingsOpen: boolean
  saveSectionHeading?: (value: string | null) => Promise<void>
  saveSectionSubheading?: (value: string | null) => Promise<void>
}

export default function HomepageBlockSectionTextFields({
  blockId,
  sectionHeading,
  sectionSubheading,
  settingsOpen,
  saveSectionHeading,
  saveSectionSubheading
}: Props) {
  const savedHeading = sectionHeading ?? ''
  const savedSub = sectionSubheading ?? ''

  const [headingDraft, setHeadingDraft] = useState(savedHeading)
  const [subDraft, setSubDraft] = useState(savedSub)
  const headingInputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    setHeadingDraft(savedHeading)
    setSubDraft(savedSub)
  }, [blockId, savedHeading, savedSub])

  useEffect(() => {
    if (!settingsOpen || !saveSectionHeading) return
    const id = window.setTimeout(() => headingInputRef.current?.focus(), 0)
    return () => window.clearTimeout(id)
  }, [settingsOpen, saveSectionHeading])

  const headingTrimmed = headingDraft.trim()
  const subTrimmed = subDraft.trim()
  const headingDirty = headingTrimmed !== savedHeading.trim()
  const subDirty = subTrimmed !== savedSub.trim()

  const headingMutation = useMutation({
    mutationFn: async (value: string | null) => {
      if (!saveSectionHeading) return
      await saveSectionHeading(value)
    }
  })

  const subMutation = useMutation({
    mutationFn: async (value: string | null) => {
      if (!saveSectionSubheading) return
      await saveSectionSubheading(value)
    }
  })

  if (!saveSectionHeading) return null

  const showSub = Boolean(saveSectionSubheading)

  return (
    <section className="hf-block-settings-section">
      <h3 className="hf-block-settings-kicker">Section title</h3>
      <p className="hf-block-settings-hint">
        Optional headline shown above this block on the public site.
      </p>
      <label className="hf-sr-only" htmlFor={`hf-section-heading-${blockId}`}>
        Section title
      </label>
      <input
        ref={headingInputRef}
        id={`hf-section-heading-${blockId}`}
        type="text"
        className="hf-block-section-heading-input"
        maxLength={SECTION_HEADING_MAX_LEN}
        placeholder="e.g. Featured reporting"
        value={headingDraft}
        onChange={(e) => setHeadingDraft(e.target.value)}
        disabled={headingMutation.isPending}
        autoComplete="off"
      />
      <div className="hf-block-section-heading-row">
        <button
          type="button"
          className="hf-btn-ghost"
          disabled={!headingDirty || headingMutation.isPending}
          onClick={() => setHeadingDraft(savedHeading)}
        >
          Reset
        </button>
        <button
          type="button"
          className="hf-btn-primary"
          disabled={!headingDirty || headingMutation.isPending}
          onClick={() =>
            headingMutation.mutate(
              headingTrimmed === '' ? null : headingTrimmed
            )
          }
        >
          {headingMutation.isPending ? 'Saving…' : 'Save title'}
        </button>
      </div>
      {headingMutation.isError ? (
        <p className="hf-block-section-heading-error">
          {headingMutation.error instanceof Error
            ? headingMutation.error.message
            : 'Failed to save heading.'}
        </p>
      ) : null}

      {showSub ? (
        <>
          <h3 className="hf-block-settings-kicker hf-block-settings-kicker-spaced">
            Subheading
          </h3>
          <p className="hf-block-settings-hint">
            Optional supporting line under the title (shown on the public site
            when set).
          </p>
          <label className="hf-sr-only" htmlFor={`hf-section-sub-${blockId}`}>
            Subheading
          </label>
          <textarea
            id={`hf-section-sub-${blockId}`}
            className="hf-block-section-subheading-input"
            maxLength={SECTION_SUBHEADING_MAX_LEN}
            rows={3}
            placeholder="e.g. Fresh picks from our editors this week"
            value={subDraft}
            onChange={(e) => setSubDraft(e.target.value)}
            disabled={subMutation.isPending}
            autoComplete="off"
          />
          <div className="hf-block-section-heading-row">
            <button
              type="button"
              className="hf-btn-ghost"
              disabled={!subDirty || subMutation.isPending}
              onClick={() => setSubDraft(savedSub)}
            >
              Reset
            </button>
            <button
              type="button"
              className="hf-btn-primary"
              disabled={!subDirty || subMutation.isPending}
              onClick={() =>
                subMutation.mutate(subTrimmed === '' ? null : subTrimmed)
              }
            >
              {subMutation.isPending ? 'Saving…' : 'Save subheading'}
            </button>
          </div>
          {subMutation.isError ? (
            <p className="hf-block-section-heading-error">
              {subMutation.error instanceof Error
                ? subMutation.error.message
                : 'Failed to save subheading.'}
            </p>
          ) : null}
        </>
      ) : null}
    </section>
  )
}
