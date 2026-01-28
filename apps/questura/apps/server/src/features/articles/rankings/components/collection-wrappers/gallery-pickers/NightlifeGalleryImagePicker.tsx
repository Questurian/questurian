/**
 * Nightlife Gallery Image Picker
 * Wrapper component for the base GalleryImagePicker
 * Configured for the nightlife collection
 */

'use client'

import React from 'react'
import GalleryImagePicker from '../../shared/GalleryImagePicker'

const NightlifeGalleryImagePicker = (props: any) => {
  return <GalleryImagePicker {...props} collectionName="nightlife" />
}

export default NightlifeGalleryImagePicker
