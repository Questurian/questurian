/**
 * Place Item Field Component
 *
 * Collection-specific wrapper for place items.
 * Passes "Place" as the collection label to RelationshipFieldWithPreview.
 */

'use client'

import React from 'react'
import RelationshipFieldWithPreview from '../../shared/RelationshipFieldWithPreview'

const PlaceItemField = (props: any) => {
  return <RelationshipFieldWithPreview {...props} collectionLabel="Place" />
}

export default PlaceItemField
