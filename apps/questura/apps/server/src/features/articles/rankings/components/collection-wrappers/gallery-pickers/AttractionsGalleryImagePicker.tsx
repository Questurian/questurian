/**
 * Attractions Gallery Image Picker
 * Wrapper component for the base GalleryImagePicker
 * Configured for the attractions collection
 */

'use client'

import React from 'react'
import GalleryImagePicker from '../../shared/GalleryImagePicker'

const AttractionsGalleryImagePicker = (props: any) => {
  return <GalleryImagePicker {...props} collectionName="attractions" />
}

export default AttractionsGalleryImagePicker
