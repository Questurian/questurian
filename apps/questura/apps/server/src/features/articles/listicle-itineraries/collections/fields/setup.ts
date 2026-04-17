import { Field } from 'payload'
import {
  createLocationRefField,
  createSharedNeighborhoodsField,
} from '@/shared/location/server/fields'

export const title: Field = {
  name: 'title',
  label: 'Title',
  type: 'text',
  required: true,
  admin: {
    description: 'Main title for the itinerary listicle',
    components: {
      Field: 'src/features/articles/listicle-itineraries/components/field-components/SmartField.tsx',
    },
  },
}

export const location: Field = {
  name: 'location',
  label: 'Location',
  type: 'text',
  required: true,
  admin: {
    description: 'Select the location for this itinerary',
    components: {
      Field: 'src/shared/location/LocationPickerField.tsx',
    },
  },
}

export const locationRef: Field = createLocationRefField()

export const sharedNeighborhoods: Field = createSharedNeighborhoodsField()

export const step1UiWrapper: Field = {
  type: 'ui',
  name: 'step1_ui_wrapper',
  admin: {
    components: {
      Field: 'src/features/articles/listicle-itineraries/components/layout/Step1Wrapper.tsx',
    },
  },
}
