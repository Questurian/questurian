/**
 * Accommodation Item Field Component
 *
 * Collection-specific wrapper for accommodation items.
 * Passes "Accommodation" as the collection label to RelationshipFieldWithPreview.
 */

'use client'

import React from 'react'
import RelationshipFieldWithPreview from '../../shared/RelationshipFieldWithPreview'

const AccommodationItemField = (props: any) => {
  return <RelationshipFieldWithPreview {...props} collectionLabel="Accommodation" />
}

export default AccommodationItemField
