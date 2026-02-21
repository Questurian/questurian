/**
 * Data Attractions Block
 * Block type for selecting attraction items from the data collection
 * References Attractions collection with single image selection
 */

import { Block } from 'payload'
import { createLocationFilter } from './utils/locationFilter'

export const DataAttractionsBlock: Block = {
  slug: 'data-attractions',
  labels: {
    singular: 'Attraction Item',
    plural: 'Attraction Items',
  },
  fields: [
    {
      name: 'item',
      type: 'relationship',
      relationTo: 'attractions',
      required: true,
      filterOptions: createLocationFilter('attractions'),
      admin: {
        description: 'Select an attraction from the data collection',
        components: {
          Field: 'src/features/articles/rankings/components/collection-wrappers/item-fields/AttractionItemField.tsx',
        },
      },
    },
    {
      name: 'selectedGalleryIndices',
      type: 'json',
      defaultValue: [],
      admin: {
        description: 'Select up to 5 gallery images (first selected = featured image, order matters)',
        components: {
          Field: 'src/features/articles/rankings/components/collection-wrappers/gallery-pickers/AttractionsGalleryImagePicker.tsx',
        },
      },
      validate: (value: unknown) => {
        if (!Array.isArray(value)) return 'Must be an array'
        if (value.length > 5) return 'Maximum 5 images allowed'
        if (!value.every((v: any) => typeof v === 'number' && v >= 0)) {
          return 'Invalid image indices'
        }
        return true
      },
    },
    {
      name: 'selectedInstagramIndex',
      type: 'number',
      admin: {
        hidden: true, // Hidden because it's managed by the gallery picker
        description: 'Index of selected Instagram post (null if regular image selected)',
      },
    },
    {
      name: 'perfectFor',
      type: 'relationship',
      relationTo: 'perfect-for-tags',
      hasMany: true,
      label: 'Perfect For',
      admin: {
        description: 'Tags describing what this recommendation is perfect for',
        components: {
          Field: 'src/features/shared/perfect-for/PerfectForPickerField.tsx',
        },
      },
    },
    {
      name: 'content',
      type: 'richText',
      required: true,
      admin: {
        description: 'Editorial content or commentary about this attraction',
      },
    },
  ],
}
