import type { Field } from 'payload'

const createVirtualDetailTypeField = (name: string): Field => ({
  name,
  type: 'text',
  admin: { hidden: true },
  hooks: {
    beforeChange: [({ siblingData }) => {
      delete siblingData[name]
    }],
  },
})

export const placeCategoryFields: Field[] = [
  {
    name: 'title',
    type: 'text',
    required: true,
    unique: true,
    admin: { description: 'Place name' },
  },
  {
    name: 'categories',
    type: 'relationship',
    relationTo: 'place-categories' as never,
    hasMany: true,
    required: true,
    admin: {
      description: 'Select one or more categories for this place',
      position: 'sidebar',
    },
  },
  createVirtualDetailTypeField('diningType'),
  createVirtualDetailTypeField('accommodationType'),
  createVirtualDetailTypeField('nightlifeType'),
  createVirtualDetailTypeField('attractionType'),
  {
    name: 'categoryDetails',
    type: 'ui',
    admin: {
      position: 'sidebar',
      components: {
        Field: 'src/features/places/components/PlaceDetailsField.tsx',
      },
    },
  },
]
