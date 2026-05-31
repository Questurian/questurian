import type { Block, Field } from 'payload'

/**
 * Stable reference from a published snapshot block back to the draft block it was
 * snapshotted from. Draft and published rows of a block type share one Postgres table,
 * so the published row cannot reuse the draft block's `id` (PK collision) — instead it
 * stores the draft id here at publish time. Hidden; only meaningful on published rows.
 *
 * Spread into every homepage block config's `fields` array.
 */
export const sourceBlockKeyField: Field = {
  name: 'sourceBlockKey',
  type: 'text',
  required: false,
  admin: {
    hidden: true,
    description: 'Internal: links a published block back to its draft block.',
  },
}

/** Returns copies of the given blocks with the hidden `sourceBlockKey` field appended. */
export function withSourceBlockKey(blocks: Block[]): Block[] {
  return blocks.map((block) => ({
    ...block,
    fields: [...block.fields, sourceBlockKeyField],
  }))
}
