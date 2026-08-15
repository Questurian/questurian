import type { Field } from 'payload'

/**
 * Access tier: what an editorial item costs to read (ADR-0009).
 *
 * Declared per document and never inferred from collection, category or tag.
 * A blanket rule cannot express "this itinerary is the free sample", which is
 * the thing that sells the paid ones.
 */
export const ACCESS_TIERS = ['free', 'member'] as const

export type AccessTier = (typeof ACCESS_TIERS)[number]

/**
 * New and pre-existing documents are `free`. The safe direction is the one
 * where forgetting to think about a document leaves it readable rather than
 * silently paywalled, and it is what makes the field's first deploy inert.
 */
export const DEFAULT_ACCESS_TIER: AccessTier = 'free'

export function isAccessTier(value: unknown): value is AccessTier {
  return typeof value === 'string' && (ACCESS_TIERS as readonly string[]).includes(value)
}

/**
 * Whether a document is a Gated item.
 *
 * Fails closed the other way on purpose: an unrecognised or absent value reads
 * as `free`, so a document can never become unreadable because of a bad tier
 * string. Gating something requires saying so explicitly; the money bug this
 * work exists to close is content served for free, and the mirror-image bug --
 * content a paying member cannot read -- is the one that generates disputes.
 */
export function isGatedItem(doc: unknown): boolean {
  if (!doc || typeof doc !== 'object') return false
  return (doc as { access?: unknown }).access === 'member'
}

export const accessTierField: Field = {
  name: 'access',
  type: 'select',
  required: true,
  defaultValue: DEFAULT_ACCESS_TIER,
  options: [
    { label: 'Free — the whole item is public', value: 'free' },
    { label: 'Members only — free sample, then paywall', value: 'member' },
  ],
  admin: {
    position: 'sidebar',
    description:
      'Members only shows every reader a free sample and requires a membership for the rest. The sample is derived automatically — there is nothing to mark up in the body.',
  },
}
