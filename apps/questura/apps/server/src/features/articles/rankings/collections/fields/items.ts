import { Field } from 'payload'
import { DataDiningBlock, DataAccommodationsBlock, DataAttractionsBlock, DataNightlifeBlock } from '../../blocks'

export const items: Field = {
  name: 'items',
  type: 'blocks',
  blocks: [DataDiningBlock, DataAccommodationsBlock, DataAttractionsBlock, DataNightlifeBlock],
  admin: {
    components: {
      Field: 'src/features/articles/rankings/components/RankingsBlocksField.tsx',
    },
    description: 'Add and arrange ranking items (filtered by ranking type)',
    condition: (data) => Boolean(data?.step1_complete && !data?.in_update_mode),
  },
}

