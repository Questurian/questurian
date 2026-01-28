/**
 * Attraction Item Field Component
 *
 * Collection-specific wrapper for attraction items.
 * Passes "Attraction" as the collection label to RelationshipFieldWithPreview.
 */

'use client'

import React from 'react'
import RelationshipFieldWithPreview from '../../shared/RelationshipFieldWithPreview'

const AttractionItemField = (props: any) => {
  return <RelationshipFieldWithPreview {...props} collectionLabel="Attraction" />
}

export default AttractionItemField
