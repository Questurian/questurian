import { Field } from 'payload'
import { listicleItineraryBlocks } from '../../blocks'

export const items: Field = {
  name: 'items',
  type: 'blocks',
  minRows: 1,
  maxRows: 96,
  blocks: listicleItineraryBlocks,
  admin: {
    description: 'Add itinerary items in chronological order. On publish, they must cover the entire time window without gaps.',
    condition: (data) => Boolean(data?.step1_complete && !data?.in_update_mode),
  },
}
