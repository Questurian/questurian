/**
 * Place Gallery Image Picker Wrapper
 *
 * Wrapper component for GalleryImagePicker that provides
 * the collection name ('places') to the base component.
 */

'use client'

import React from 'react'
import GalleryImagePicker from '../../shared/GalleryImagePicker'

const PlaceGalleryImagePicker = (props: any) => {
  return <GalleryImagePicker {...props} collectionName="places" />
}

export default PlaceGalleryImagePicker
