import { Field } from 'payload'
import { createLocationRefField } from '@/shared/location/server/fields'

const dayAudienceOptions = [
  { label: 'Any Day', value: 'anyday' },
  { label: 'Weekday', value: 'weekday' },
  { label: 'Weekend', value: 'weekend' },
]

const quarterHourOptions = [
  { label: '00', value: '00' },
  { label: '15', value: '15' },
  { label: '30', value: '30' },
  { label: '45', value: '45' },
]

const periodOptions = [
  { label: 'AM', value: 'AM' },
  { label: 'PM', value: 'PM' },
]

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

export const dayAudience: Field = {
  name: 'dayAudience',
  label: 'Day Type',
  type: 'select',
  required: true,
  defaultValue: 'anyday',
  options: dayAudienceOptions,
  admin: {
    description: 'Choose whether this itinerary fits any day, weekdays, or weekends',
    components: {
      Field: 'src/features/articles/listicle-itineraries/components/field-components/SmartField.tsx',
    },
  },
}

export const itineraryStart: Field = {
  type: 'row',
  fields: [
    {
      name: 'itineraryStartHour',
      label: 'Start Hour',
      type: 'number',
      required: true,
      min: 1,
      max: 12,
      admin: { width: '34%' },
    },
    {
      name: 'itineraryStartMinute',
      label: 'Start Minute',
      type: 'select',
      required: true,
      defaultValue: '00',
      options: quarterHourOptions,
      admin: { width: '33%' },
    },
    {
      name: 'itineraryStartPeriod',
      label: 'Start',
      type: 'select',
      required: true,
      options: periodOptions,
      admin: { width: '33%' },
    },
  ],
}

export const itineraryEnd: Field = {
  type: 'row',
  fields: [
    {
      name: 'itineraryEndHour',
      label: 'End Hour',
      type: 'number',
      required: true,
      min: 1,
      max: 12,
      admin: { width: '34%' },
    },
    {
      name: 'itineraryEndMinute',
      label: 'End Minute',
      type: 'select',
      required: true,
      defaultValue: '00',
      options: quarterHourOptions,
      admin: { width: '33%' },
    },
    {
      name: 'itineraryEndPeriod',
      label: 'End',
      type: 'select',
      required: true,
      options: periodOptions,
      admin: { width: '33%' },
    },
  ],
}

export const step1UiWrapper: Field = {
  type: 'ui',
  name: 'step1_ui_wrapper',
  admin: {
    components: {
      Field: 'src/features/articles/listicle-itineraries/components/layout/Step1Wrapper.tsx',
    },
  },
}
