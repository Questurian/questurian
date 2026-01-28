import { Field } from 'payload'

export const step1Complete: Field = {
  name: 'step1_complete',
  type: 'checkbox',
  defaultValue: false,
  admin: {
    hidden: true,
  },
}

export const inUpdateMode: Field = {
  name: 'in_update_mode',
  type: 'checkbox',
  defaultValue: false,
  admin: {
    hidden: true,
  },
}

export const locationFinalized: Field = {
  name: 'location_finalized',
  type: 'checkbox',
  admin: {
    hidden: true,
  },
}

