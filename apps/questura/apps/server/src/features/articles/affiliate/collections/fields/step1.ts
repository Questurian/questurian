import { Field } from 'payload'

export const title: Field = {
  name: 'title',
  type: 'text',
  required: true,
  admin: {
    components: {
      Field: 'src/features/articles/affiliate/components/field-components/SmartField.tsx',
    },
  },
}

export const step1UiWrapper: Field = {
  name: 'step1UiWrapper',
  type: 'ui',
  admin: {
    components: {
      Field: 'src/features/articles/affiliate/components/layout/Step1Wrapper.tsx',
    },
  },
}

