'use client'

import { useMemo } from 'react'
import { useFormFields } from '@payloadcms/ui'
import { type Block } from 'payload'
import { getBlocksForType } from '../blocks'

interface BlockFilteringState {
  listicleType: string | undefined
  availableBlocks: Block[]
  modifiedField: (field: any) => any
}

export const useBlockFiltering = (_: any): BlockFilteringState => {
  const { listicleType } = useFormFields(([fields]) => ({
    listicleType: fields.listicleType?.value as string | undefined,
  }))

  const availableBlocks = useMemo(() => getBlocksForType(listicleType), [listicleType])

  const modifiedField = useMemo(() => {
    return (fieldConfig: any) => {
      if (!fieldConfig) return fieldConfig
      return {
        ...fieldConfig,
        blocks: availableBlocks as any,
      }
    }
  }, [availableBlocks])

  return {
    listicleType,
    availableBlocks,
    modifiedField,
  }
}
