import { ArrowRight } from 'lucide-react'
import { Dialog } from './Dialog'
import { DAYPART_LABELS } from '../templates'
import type { DayDraft, DayTemplate } from '../types'

/**
 * "Here is what that would give you."
 *
 * Choosing a different day type is destructive — it replaces every stop,
 * including the ones you edited — so the selector previews and this decides.
 * The current layout is shown beside the proposed one because the question is
 * not "is this a good template", it is "am I willing to lose that".
 */

export interface LayoutReplacementDialogProps {
  day: DayDraft
  dayNumber: number
  template: DayTemplate
  onApply: () => void
  onCancel: () => void
}

export function LayoutReplacementDialog({
  day,
  dayNumber,
  template,
  onApply,
  onCancel,
}: LayoutReplacementDialogProps) {
  const edited = day.slots.length !== 0

  return (
    <Dialog
      wide
      title={`Use ${template.name} for Day ${dayNumber}?`}
      description={
        edited
          ? 'This replaces every stop on this day, including any you have edited. Nothing changes until you choose Use this layout.'
          : 'Nothing changes until you choose Use this layout.'
      }
      onClose={onCancel}
      footer={
        <>
          <button type="button" className="ip-button-quiet" onClick={onCancel}>
            Keep current layout
          </button>
          <button type="button" className="ip-button-primary" onClick={onApply}>
            Use this layout
          </button>
        </>
      }
    >
      <p className="ip-dialog-lead">{template.rhythm}</p>
      {template.shape ? <p className="ip-shape">{template.shape}</p> : null}

      <div className="ip-compare">
        <section>
          <h3>Now — {day.sourceTemplateName}</h3>
          <ol className="ip-preview-list">
            {day.slots.map(slot => (
              <li key={slot.id}>
                <span className="ip-daypart">{DAYPART_LABELS[slot.daypart]}</span>
                <span>{slot.label}</span>
              </li>
            ))}
            {day.slots.length === 0 ? <li className="ip-empty">No stops</li> : null}
          </ol>
        </section>
        <div className="ip-compare-arrow" aria-hidden>
          <ArrowRight size={18} />
        </div>
        <section>
          <h3>After — {template.name}</h3>
          <ol className="ip-preview-list ip-preview-list-next">
            {template.slots.map((slot, index) => (
              <li key={`${slot.sourceSlotId ?? slot.label}-${index}`}>
                <span className="ip-daypart">{DAYPART_LABELS[slot.daypart]}</span>
                <span>
                  {slot.label}
                  {slot.optional ? <span className="ip-optional-mark"> · optional</span> : null}
                </span>
              </li>
            ))}
          </ol>
        </section>
      </div>
    </Dialog>
  )
}
