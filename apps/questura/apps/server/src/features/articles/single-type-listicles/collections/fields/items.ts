import { Field } from 'payload'
import {
  DataDiningBlock,
  DataAccommodationsBlock,
  DataAttractionsBlock,
  DataNightlifeBlock,
} from '../../blocks'

export const items: Field = {
  name: 'items',
  type: 'blocks',
  minRows: 1,
  maxRows: 50,
  blocks: [DataDiningBlock, DataAccommodationsBlock, DataAttractionsBlock, DataNightlifeBlock],
  admin: {
    components: {
      Field: 'src/features/articles/single-type-listicles/components/SingleTypeListicleBlocksField.tsx',
    },
    description: 'Add ranked items. Only the selected listicle data type is allowed.',
    condition: (data) => Boolean(data?.step1_complete && !data?.in_update_mode),
  },
}
