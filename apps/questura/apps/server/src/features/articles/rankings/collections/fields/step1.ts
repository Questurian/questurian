import { Field } from 'payload'
import { createLocationRefField } from '@/shared/location/server/fields'

const rankingTypeOptions = [
  { label: 'Dining', value: 'dining' },
  { label: 'Accommodations', value: 'accommodations' },
  { label: 'Attractions', value: 'attractions' },
  { label: 'Nightlife', value: 'nightlife' },
]

export const location: Field = {
  name: 'location',
  label: 'Location',
  type: 'text',
  required: true,
  admin: {
    description: 'Select the location',
    components: {
      Field: 'src/shared/location/LocationPickerField.tsx',
    },
  },
}

export const locationRef: Field = createLocationRefField()

export const rankingType: Field = {
  name: 'rankingType',
  label: 'Ranking Type',
  type: 'select',
  required: true,
  options: rankingTypeOptions,
  admin: {
    description: 'Select the type of ranking',
    components: {
      Field: 'src/features/articles/rankings/components/field-components/SmartField.tsx',
    },
  },
}

export const title: Field = {
  name: 'title',
  label: 'Title',
  type: 'text',
  required: true,
  admin: {
    description: 'Ranking title',
    components: {
      Field: 'src/features/articles/rankings/components/field-components/SmartField.tsx',
    },
  },
}

export const step1UiWrapper: Field = {
  type: 'text',
  name: 'step1_ui_wrapper',
  label: false,
  admin: {
    hidden: false,
    components: {
      Field: 'src/features/articles/rankings/components/layout/Step1Wrapper.tsx',
    },
  },
}
