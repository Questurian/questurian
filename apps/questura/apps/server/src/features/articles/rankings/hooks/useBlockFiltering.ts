'use client'

/**
 * useBlockFiltering Hook
 *
 * Encapsulates the logic for dynamically filtering available blocks
 * based on the selected ranking type.
 *
 * Problem It Solves:
 * - In a rankings form, users can select different ranking types (dining, accommodations, etc.)
 * - Each ranking type has different block types available
 * - We need to filter the BlocksField to only show blocks matching the current ranking type
 * - This prevents users from accidentally mixing block types (e.g., adding a dining block to an attractions ranking)
 *
 * How It Works:
 * 1. Reads rankingType from form state via useFormFields
 * 2. Computes available blocks using getBlocksForType()
 * 3. Memoizes the result to prevent unnecessary re-renders
 * 4. Returns both the filtered blocks and the modified field config
 */

import { useMemo } from 'react'
import { useFormFields } from '@payloadcms/ui'
import { type Block } from 'payload'
import { getBlocksForType } from '../blocks'

/**
 * Configuration object returned by the hook
 */
interface BlockFilteringState {
  /**
   * Currently selected ranking type (dining, accommodations, attractions, nightlife)
   */
  rankingType: string | undefined

  /**
   * Available blocks for the current ranking type
   * Usually contains 1 block, but structure allows for multiple blocks per type
   */
  availableBlocks: Block[]

  /**
   * Modified field config with filtered blocks
   * Used to replace the BlocksField's blocks array
   */
  modifiedField: (field: any) => any
}

/**
 * Hook that manages block filtering based on ranking type
 *
 * @param field - The BlocksField configuration from Payload
 * @returns {BlockFilteringState} Filtered blocks and modified field config
 *
 * @example
 * const { rankingType, availableBlocks, modifiedField } = useBlockFiltering(props.field)
 * return <BlocksField {...props} field={modifiedField(props.field)} />
 */
export const useBlockFiltering = (field: any): BlockFilteringState => {
  // ===========================
  // 1. READ RANKING TYPE
  // ===========================
  // Use Payload's useFormFields hook to access the current ranking type
  const { rankingType, location } = useFormFields(([fields]) => ({
    rankingType: fields.rankingType?.value as string | undefined,
    location: fields.location?.value as string | undefined,
  }))

  // ===========================
  // 2. COMPUTE FILTERED BLOCKS
  // ===========================
  // Get the list of blocks available for this ranking type
  // Memoized so it only recomputes when rankingType changes
  const availableBlocks = useMemo(() => {
    const blocks = getBlocksForType(rankingType)
    console.log('[useBlockFiltering] rankingType:', rankingType)
    console.log('[useBlockFiltering] location:', location)
    console.log('[useBlockFiltering] availableBlocks:', blocks.map((b) => b.slug))
    return blocks
  }, [rankingType])

  // ===========================
  // 3. CREATE MODIFIED FIELD CONFIG
  // ===========================
  // Instead of registering all blocks in the field config,
  // we dynamically replace the blocks array based on ranking type
  // This is done in useMemo so it only recomputes when needed
  const modifiedField = useMemo(() => {
    return (fieldConfig: any) => {
      if (!fieldConfig) return fieldConfig
      return {
        ...fieldConfig,
        blocks: availableBlocks as any,
      }
    }
  }, [availableBlocks])

  // ===========================
  // 4. RETURN STATE
  // ===========================
  return {
    rankingType,
    availableBlocks,
    modifiedField,
  }
}
