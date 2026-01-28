/**
 * Dining Gallery Image Picker Wrapper
 *
 * Wrapper component for GalleryImagePicker that provides
 * the collection name ('dining') to the base component.
 */

'use client'

import React from 'react'
import GalleryImagePicker from '../../shared/GalleryImagePicker'

const DiningGalleryImagePicker = (props: any) => {
  return <GalleryImagePicker {...props} collectionName="dining" />
}

export default DiningGalleryImagePicker
