/**
 * Nightlife Item Field Component
 *
 * Collection-specific wrapper for nightlife items.
 * Passes "Nightlife" as the collection label to RelationshipFieldWithPreview.
 */

'use client'

import React from 'react'
import RelationshipFieldWithPreview from '../../shared/RelationshipFieldWithPreview'

const NightlifeItemField = (props: any) => {
  return <RelationshipFieldWithPreview {...props} collectionLabel="Nightlife" />
}

export default NightlifeItemField
