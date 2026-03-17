import { Field } from 'payload'
import {
  createLocationRefField,
  createSharedNeighborhoodsField,
} from '@/shared/location/server/fields'

const listicleTypeOptions = [
  { label: 'Dining', value: 'dining' },
  { label: 'Accommodations', value: 'accommodations' },
  { label: 'Attractions', value: 'attractions' },
  { label: 'Nightlife', value: 'nightlife' },
]

export const title: Field = {
  name: 'title',
  label: 'Title',
  type: 'text',
  required: true,
  admin: {
    description: 'Main title for the listicle',
    components: {
      Field: 'src/features/articles/single-type-listicles/components/field-components/SmartField.tsx',
    },
  },
}

export const location: Field = {
  name: 'location',
  label: 'Location',
  type: 'text',
  required: true,
  admin: {
    description: 'Select the location for this listicle',
    components: {
      Field: 'src/shared/location/LocationPickerField.tsx',
    },
  },
}

export const locationRef: Field = createLocationRefField()

export const sharedNeighborhoods: Field = createSharedNeighborhoodsField()

export const listicleType: Field = {
  name: 'listicleType',
  label: 'Listicle Data Type',
  type: 'select',
  required: true,
  options: listicleTypeOptions,
  admin: {
    description: 'Select one data type for this listicle',
    components: {
      Field: 'src/features/articles/single-type-listicles/components/field-components/SmartField.tsx',
    },
  },
}

export const targetItemCount: Field = {
  name: 'targetItemCount',
  label: 'Target List Size',
  type: 'number',
  required: true,
  min: 1,
  max: 50,
  defaultValue: 6,
  admin: {
    description: 'Number of ranked items required for publish (1-50)',
    components: {
      Field: 'src/features/articles/single-type-listicles/components/field-components/SmartField.tsx',
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
      Field: 'src/features/articles/single-type-listicles/components/layout/Step1Wrapper.tsx',
    },
  },
}
