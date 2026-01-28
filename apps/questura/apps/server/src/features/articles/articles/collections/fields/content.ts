import { Field } from 'payload'
import { articleBlocks } from '../../blocks'

export const contentBlocks: Field = {
  name: 'contentBlocks',
  type: 'blocks',
  blocks: articleBlocks,
  admin: {
    condition: (data) => Boolean(data?.step1_complete && !data?.in_update_mode),
  },
}

