import { Field } from 'payload'
import { DataAffiliateBlock } from '../../blocks'

export const items: Field = {
  name: 'items',
  type: 'blocks',
  minRows: 1,
  blocks: [DataAffiliateBlock],
  admin: {
    condition: (_, siblingData) => siblingData?.step1_complete,
  },
}

