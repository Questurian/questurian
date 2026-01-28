import { Field } from 'payload'
import { createLocationRefField } from '@/shared/location/server/fields'

export const title: Field = {
  name: 'title',
  type: 'text',
  required: true,
  admin: {
    components: {
      Field: 'src/features/articles/itineraries/components/field-components/SmartField.tsx',
    },
  },
}

export const location: Field = {
  name: 'location',
  type: 'text',
  required: true,
  admin: {
    description: 'Select the location for this itinerary',
    components: {
      Field: 'src/features/articles/itineraries/components/field-components/SmartField.tsx',
    },
  },
}

export const locationRef: Field = createLocationRefField()

export const step1UiWrapper: Field = {
  name: 'step1UiWrapper',
  type: 'ui',
  admin: {
    components: {
      Field: 'src/features/articles/itineraries/components/layout/Step1Wrapper.tsx',
    },
  },
}









