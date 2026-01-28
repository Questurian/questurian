'use client'

/**
 * RankingsBlocksField Component
 *
 * Custom Payload admin field that filters available blocks based on the selected ranking type.
 *
 * Problem:
 * - All 4 block types (dining, accommodations, attractions, nightlife) are registered
 * - User should only see blocks matching their selected ranking type
 * - Mixing block types would create invalid data
 *
 * Solution:
 * - Intercepts BlocksField and replaces its blocks array at render time
 * - Uses useBlockFiltering hook to dynamically compute available blocks
 * - Re-renders when ranking type changes (forces BlocksField to update)
 *
 * How It Works:
 * 1. Hook reads rankingType from form state
 * 2. Hook gets filtered blocks via getBlocksForType()
 * 3. Hook returns modifiedField function that replaces blocks array
 * 4. Component passes modified field to BlocksField
 * 5. When rankingType changes, component re-renders with new key
 */

import { type ComponentProps } from 'react'
import { BlocksField } from '@payloadcms/ui'
import { useBlockFiltering } from '../hooks/useBlockFiltering'

type RankingsBlocksFieldProps = ComponentProps<typeof BlocksField>

const RankingsBlocksFieldComponent = (props: RankingsBlocksFieldProps) => {
  // Delegate all filtering logic to the hook
  // Hook handles: reading rankingType, computing available blocks, memoization
  const { rankingType, modifiedField } = useBlockFiltering(props.field)

  // Pass the modified field (with filtered blocks) to Payload's BlocksField
  // key={rankingType} forces re-render when ranking type changes
  // This ensures BlocksField updates to show only the new ranking type's blocks
  return (
    <BlocksField key={rankingType} {...props} field={modifiedField(props.field)} />
  )
}

export const RankingsBlocksField = RankingsBlocksFieldComponent
export default RankingsBlocksFieldComponent
