/**
 * Dining Item Field Component
 *
 * Collection-specific wrapper for dining items.
 * Passes "Dining" as the collection label to RelationshipFieldWithPreview.
 */

'use client'

import React from 'react'
import RelationshipFieldWithPreview from '../../shared/RelationshipFieldWithPreview'

const DiningItemField = (props: any) => {
  return <RelationshipFieldWithPreview {...props} collectionLabel="Dining" />
}

export default DiningItemField
