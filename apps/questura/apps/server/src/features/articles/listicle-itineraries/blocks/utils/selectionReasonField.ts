import { Field } from 'payload'

/**
 * Internal per-stop rationale produced by Itinerary Autobuild (AI Blog Writer).
 *
 * Records *why* this venue was chosen for this slot, written as a concrete fit +
 * draw so the downstream blurb writer can build on it. Operator-editable, not
 * rendered on the public site — it is generation/audit metadata that also seeds
 * blurbs. See AI Blog Writer ADR 0014/0015 and the `Selection Reason` glossary
 * entry. Optional so manually-added stops (and pre-blurb drafts) round-trip.
 */
export const selectionReasonField: Field = {
  name: 'selectionReason',
  type: 'textarea',
  required: false,
  admin: {
    description:
      'AI rationale for choosing this venue (internal — not public). Seeds the blurb writer; edit freely.',
  },
}
