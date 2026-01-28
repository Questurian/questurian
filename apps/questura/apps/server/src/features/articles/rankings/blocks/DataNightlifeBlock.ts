/**
 * Data Nightlife Block
 * Block type for selecting nightlife items from the data collection
 * References Nightlife collection with single image selection
 */

import { Block } from 'payload'
import { createLocationFilter } from './utils/locationFilter'

export const DataNightlifeBlock: Block = {
  slug: 'data-nightlife',
  labels: {
    singular: 'Nightlife Item',
    plural: 'Nightlife Items',
  },
  admin: {
    initCollapsed: false,
  },
  // Custom label that shows the item's title instead of "Untitled"
  label: ({ data }) => {
    if (data?.item && typeof data.item === 'object' && 'title' in data.item) {
      return (data.item as { title: string }).title || 'Nightlife Item'
    }
    return 'Nightlife Item'
  },
  fields: [
    {
      name: 'item',
      type: 'relationship',
      relationTo: 'nightlife',
      required: true,
      filterOptions: createLocationFilter('nightlife'),
      admin: {
        description: 'Select a nightlife venue from the data collection',
        components: {
          Field: 'src/features/articles/rankings/components/collection-wrappers/item-fields/NightlifeItemField.tsx',
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
          Field: 'src/features/articles/rankings/components/collection-wrappers/gallery-pickers/NightlifeGalleryImagePicker.tsx',
        },
      },
      validate: (value) => {
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
        description: 'Editorial content or commentary about this nightlife venue',
      },
    },
  ],
}
