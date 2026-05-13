import type { Field } from 'payload'

type SelectOption = {
  label: string
  value: string
}

const getNestedFields = (field: Field): Field[] => {
  if ('fields' in field && Array.isArray(field.fields)) {
    return field.fields as Field[]
  }

  if (field.type === 'tabs' && 'tabs' in field && Array.isArray(field.tabs)) {
    return field.tabs.flatMap((tab) => (tab.fields as Field[] | undefined) ?? [])
  }

  if ('blocks' in field && Array.isArray(field.blocks)) {
    return field.blocks.flatMap((block) => block.fields ?? [])
  }

  return []
}

const findFieldByName = (fields: Field[], fieldName: string): Field | undefined => {
  const directMatch = fields.find((field) => 'name' in field && field.name === fieldName)
  if (directMatch) {
    return directMatch
  }

  return fields
    .map((field) => {
      const nestedFields = getNestedFields(field)
      if (!nestedFields.length) {
        return undefined
      }
      return findFieldByName(nestedFields, fieldName)
    })
    .find((field): field is Field => Boolean(field))
}

const normalizeSelectOptions = (options: unknown): SelectOption[] => {
  if (!Array.isArray(options)) {
    return []
  }

  return options
    .map((option) => {
      if (typeof option === 'string') {
        return { label: option, value: option }
      }

      if (
        option &&
        typeof option === 'object' &&
        'label' in option &&
        'value' in option
      ) {
        const { label, value } = option as SelectOption
        if (typeof label === 'string' && typeof value === 'string') {
          return { label, value }
        }
      }

      return null
    })
    .filter((option): option is SelectOption => Boolean(option))
}

export const getSelectFieldOptions = (
  fields: Field[],
  fieldName: string
): SelectOption[] | null => {
  const field = findFieldByName(fields, fieldName)
  if (!field || field.type !== 'select' || !('options' in field)) {
    return null
  }

  return normalizeSelectOptions(field.options)
}
