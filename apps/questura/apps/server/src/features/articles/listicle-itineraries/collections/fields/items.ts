import { Field } from 'payload'
import { listicleItineraryStopBlocks } from '../../blocks'

export const items: Field = {
  name: 'items',
  label: 'Stops',
  type: 'blocks',
  minRows: 1,
  maxRows: 96,
  blocks: listicleItineraryStopBlocks,
  admin: {
    description: "Timed stops (dining, attractions, tour agencies, etc.). Lodging is in Where you're staying above.",
    condition: (data) => Boolean(data?.step1_complete && !data?.in_update_mode),
  },
}
