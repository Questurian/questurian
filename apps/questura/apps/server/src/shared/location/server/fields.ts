import type { Field } from 'payload'

export const createLocationRefField = (): Field => ({
  name: 'locationRef',
  type: 'relationship',
  relationTo: 'locations',
  admin: {
    hidden: true,
  },
})
