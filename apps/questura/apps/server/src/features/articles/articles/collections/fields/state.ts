import { Field } from 'payload'

export const step1Complete: Field = {
  name: 'step1_complete',
  type: 'checkbox',
  admin: {
    hidden: true, // Internal state only
  },
  defaultValue: false,
}

export const inUpdateMode: Field = {
  name: 'in_update_mode',
  type: 'checkbox',
  admin: {
    hidden: true, // Internal state only
  },
  defaultValue: false,
}

