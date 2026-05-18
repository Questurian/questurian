import { Field } from 'payload'

/**
 * Optional per-item editorial angle. When unset, the AI Blog Writer auto-assigns
 * an angle based on the venue's data and rotation policy.
 */
export const angleField: Field = {
  name: 'angle',
  type: 'select',
  required: false,
  options: [
    { label: 'Signature Dish', value: 'signature-dish' },
    { label: 'Atmosphere', value: 'atmosphere' },
    { label: 'Founders / Backstory', value: 'founders-backstory' },
    { label: 'Insider Tip', value: 'insider-tip' },
    { label: 'Best-For', value: 'best-for' },
    { label: "What's Different", value: 'whats-different' },
  ],
  admin: {
    description:
      'Blurb angle for AI generation. Leave empty for Auto (backend picks based on this venue\'s data).',
  },
}
