import type { ListicleAngle, ListTone, ListicleType } from '../../types'
import { LISTICLE_ANGLE_OPTIONS, LIST_TONE_OPTIONS } from '../../types'

type AngleGuidelinePreviewModalProps = {
  isOpen: boolean
  onClose: () => void
  itemLabel: string
  itemAngle: ListicleAngle | null
  listTone: ListTone
  listicleType: ListicleType | ''
  guidelines: { angles: Record<string, string>; tones: Record<string, string> } | null
  isLoading: boolean
  error: string | null
}

const ANGLE_LABEL_BY_VALUE: Record<string, string> = LISTICLE_ANGLE_OPTIONS.reduce(
  (acc, option) => {
    acc[option.value] = option.label
    return acc
  },
  {} as Record<string, string>,
)

const TONE_LABEL_BY_VALUE: Record<string, string> = LIST_TONE_OPTIONS.reduce(
  (acc, option) => {
    acc[option.value] = option.label
    return acc
  },
  {} as Record<string, string>,
)

function AngleSection({ angleValue, guidance }: { angleValue: string; guidance: string }) {
  const label = ANGLE_LABEL_BY_VALUE[angleValue] ?? angleValue
  return (
    <section className="stl-guideline-section">
      <h4 className="stl-guideline-section__heading">Angle: {label}</h4>
      <p className="stl-guideline-section__body">{guidance}</p>
    </section>
  )
}

export function AngleGuidelinePreviewModal({
  isOpen,
  onClose,
  itemLabel,
  itemAngle,
  listTone,
  listicleType,
  guidelines,
  isLoading,
  error,
}: AngleGuidelinePreviewModalProps) {
  if (!isOpen) return null

  const toneLabel = TONE_LABEL_BY_VALUE[listTone] ?? listTone
  const toneGuidance = guidelines?.tones[listTone] ?? ''

  const isDining = listicleType === 'dining'
  const isAuto = itemAngle === null

  return (
    <div
      className="stl-modal-overlay"
      onClick={(event) => {
        if (event.target === event.currentTarget) {
          onClose()
        }
      }}
    >
      <div
        className="stl-picker-modal stl-guideline-modal"
        role="dialog"
        aria-modal="true"
        aria-label={`Prompt guidance for ${itemLabel}`}
      >
        <div className="stl-picker-modal__header">
          <h3>
            Prompt guidance — <span className="stl-inspect-target">{itemLabel}</span>
          </h3>
          <button
            type="button"
            className="stl-picker-modal__close"
            onClick={onClose}
            aria-label="Close"
          >
            ✕
          </button>
        </div>

        <div className="stl-guideline-body">
          {isLoading ? (
            <p className="stl-inspect-empty">Loading guidance...</p>
          ) : error ? (
            <p className="stl-inspect-empty">Failed to load guidance: {error}</p>
          ) : !guidelines ? (
            <p className="stl-inspect-empty">No guidance available.</p>
          ) : (
            <>
              {isAuto ? (
                isDining ? (
                  <>
                    <p className="stl-guideline-note">
                      Angle is set to <strong>Auto</strong>. The backend will pick one of the
                      following angles per-item based on this venue&apos;s data.
                    </p>
                    {LISTICLE_ANGLE_OPTIONS.map((option) => {
                      const guidance = guidelines.angles[option.value]
                      if (!guidance) return null
                      return (
                        <AngleSection
                          key={option.value}
                          angleValue={option.value}
                          guidance={guidance}
                        />
                      )
                    })}
                  </>
                ) : (
                  <p className="stl-guideline-note">
                    Angle is set to <strong>Auto</strong>. No angle block is injected into the
                    prompt for <strong>{listicleType || 'this category'}</strong> — only the tone
                    below applies.
                  </p>
                )
              ) : (
                (() => {
                  const guidance = guidelines.angles[itemAngle]
                  if (!guidance) {
                    return (
                      <p className="stl-inspect-empty">
                        No guidance found for angle &quot;{itemAngle}&quot;.
                      </p>
                    )
                  }
                  return <AngleSection angleValue={itemAngle} guidance={guidance} />
                })()
              )}

              <section className="stl-guideline-section">
                <h4 className="stl-guideline-section__heading">Tone: {toneLabel}</h4>
                <p className="stl-guideline-section__body">
                  {toneGuidance || 'No tone guidance available.'}
                </p>
              </section>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
