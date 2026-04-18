import { Field } from 'payload'
import { listicleItineraryWhereStayingBlocks } from '../../blocks'

export const whereStaying: Field = {
  name: 'whereStaying',
  label: "Where you're staying",
  type: 'blocks',
  minRows: 0,
  maxRows: 32,
  blocks: listicleItineraryWhereStayingBlocks,
  admin: {
    description: 'Nightly lodging (hotels, etc.) for this itinerary. Add stops in the Stops section below.',
    condition: (data) => Boolean(data?.step1_complete && !data?.in_update_mode),
  },
}
