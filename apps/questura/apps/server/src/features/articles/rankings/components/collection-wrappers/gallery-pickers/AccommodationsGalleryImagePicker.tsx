/**
 * Accommodations Gallery Image Picker
 * Wrapper component for the base GalleryImagePicker
 * Configured for the accommodations collection
 */

'use client'

import React from 'react'
import GalleryImagePicker from '../../shared/GalleryImagePicker'

const AccommodationsGalleryImagePicker = (props: any) => {
  return <GalleryImagePicker {...props} collectionName="accommodations" />
}

export default AccommodationsGalleryImagePicker
