/**
 * Item Preview Component
 *
 * Displays a preview card for selected items in ranking blocks.
 * Shows title, type, description, location, first gallery image, and status.
 *
 * Used by RelationshipFieldWithPreview to display item data below
 * the relationship dropdown in the admin panel.
 */

'use client'

import React from 'react'
import { getMediaSetPreviewAsset } from '@/features/media/lib/media-set-preview'

type ItemData = {
  id: string
  title: string
  type?: string
  description?: string
  location?: string
  address?: string
  phoneNumber?: string
  countryCode?: string
  website?: string
  latitude?: number
  longitude?: number
  gallery?: Array<{
    image?: {
      alt_text?: string
      title?: string
      variants?: Record<string, unknown>
    }
    altText?: string
    caption?: string
  }>
  instagramGallery?: Array<{
    post?: {
      previewImage?: {
        url?: string
        alt?: string
      }
      caption?: string
    }
  }>
  status?: string
}

type ItemPreviewProps = {
  item: ItemData
  collectionLabel: string // "Dining", "Accommodation", etc.
  selectedGalleryIndices?: number[] // Array of indices for multi-select
  selectedInstagramIndex?: number | null // Optional: which Instagram post to display (null if regular images selected)
}

export const ItemPreview: React.FC<ItemPreviewProps> = ({
  item,
  selectedGalleryIndices = [],
  selectedInstagramIndex = null,
}) => {
  // Determine which image to display
  let imageUrl: string | null = null
  let imageAlt: string | null = null
  let imageCaption: string | null = null
  let isInstagram = false
  let imageCount = 0

  // Priority 1: Instagram post
  if (selectedInstagramIndex !== null && item.instagramGallery?.[selectedInstagramIndex]) {
    const post = item.instagramGallery[selectedInstagramIndex]
    imageUrl = post.post?.previewImage?.url || null
    imageAlt = post.post?.previewImage?.alt || item.title
    imageCaption = post.post?.caption || null
    isInstagram = true
    imageCount = 1
  }
  // Priority 2: Multiple/single standard images
  else if (selectedGalleryIndices.length > 0) {
    const firstIndex = selectedGalleryIndices[0]
    const firstImage = item.gallery?.[firstIndex]

    if (firstImage) {
      const previewAsset = getMediaSetPreviewAsset(firstImage.image)
      imageUrl = previewAsset?.url || null
      imageAlt =
        firstImage.altText ||
        previewAsset?.alt_text ||
        firstImage.image?.alt_text ||
        firstImage.image?.title ||
        item.title
      imageCaption = firstImage.caption || null
      imageCount = selectedGalleryIndices.length
    }
  }
  // Fallback: First gallery image
  else if (item.gallery?.[0]) {
    const firstImage = item.gallery[0]
    const previewAsset = getMediaSetPreviewAsset(firstImage.image)
    imageUrl = previewAsset?.url || null
    imageAlt =
      firstImage.altText ||
      previewAsset?.alt_text ||
      firstImage.image?.alt_text ||
      firstImage.image?.title ||
      item.title
    imageCaption = firstImage.caption || null
    imageCount = 0 // No selection
  }

  return (
    <div
      style={{
        marginTop: '12px',
        padding: '20px',
        border: '1px solid #d0d5dd',
        borderRadius: '8px',
        backgroundColor: '#ffffff',
        boxShadow: '0 1px 3px rgba(0, 0, 0, 0.1)',
      }}
    >
      <div style={{ display: 'flex', gap: '20px', alignItems: 'flex-start' }}>
        {/* Image Section */}
        {imageUrl && (
          <div style={{ flexShrink: 0, position: 'relative' }}>
            <img
              src={imageUrl}
              alt={imageAlt || item.title}
              style={{
                width: '160px',
                height: '160px',
                objectFit: 'cover',
                borderRadius: '6px',
                border: '1px solid #e5e7eb',
              }}
            />
            {/* Instagram Badge */}
            {isInstagram && (
              <div
                style={{
                  position: 'absolute',
                  top: '8px',
                  right: '8px',
                  backgroundColor: '#7c3aed',
                  color: 'white',
                  padding: '4px 8px',
                  borderRadius: '4px',
                  fontSize: '11px',
                  fontWeight: 600,
                  boxShadow: '0 2px 4px rgba(0, 0, 0, 0.2)',
                }}
              >
                IG
              </div>
            )}

            {/* Multi-Image Count Badge */}
            {!isInstagram && imageCount > 1 && (
              <div
                style={{
                  position: 'absolute',
                  top: '8px',
                  right: '8px',
                  backgroundColor: '#3b82f6',
                  color: 'white',
                  padding: '4px 8px',
                  borderRadius: '4px',
                  fontSize: '11px',
                  fontWeight: 600,
                  boxShadow: '0 2px 4px rgba(0, 0, 0, 0.2)',
                }}
              >
                1 of {imageCount}
              </div>
            )}
            {imageCaption && (
              <p
                style={{
                  fontSize: '11px',
                  color: '#6b7280',
                  marginTop: '6px',
                  lineHeight: '1.4',
                }}
              >
                {imageCaption}
              </p>
            )}
          </div>
        )}

        {/* Info Section */}
        <div style={{ flex: 1, minWidth: 0 }}>
          {/* Title */}
          <h4
            style={{
              margin: '0 0 12px 0',
              fontSize: '20px',
              fontWeight: 700,
              color: '#111827',
              lineHeight: '1.3',
            }}
          >
            {item.title}
          </h4>

          {/* Type Badge */}
          {item.type && (
            <></>
          )}

          {/* Location */}
          {item.location && (
            <p
              style={{
                margin: '0 0 10px 0',
                fontSize: '14px',
                color: '#4b5563',
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
              }}
            >
              <strong style={{ color: '#111827' }}>📍 Location:</strong>
              <span>{item.location}</span>
            </p>
          )}

          {/* Address / Google Maps Link */}
          {item.address && (
            <p
              style={{
                margin: '0 0 10px 0',
                fontSize: '14px',
                color: '#4b5563',
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
              }}
            >
              <strong style={{ color: '#111827' }}>🗺️ Map:</strong>
              <a
                href={item.address}
                target="_blank"
                rel="noopener noreferrer"
                style={{ color: '#2563eb', textDecoration: 'underline' }}
              >
                View on Google Maps
              </a>
            </p>
          )}

          {/* Phone Number */}
          {(item.phoneNumber || item.countryCode) && (
            <p
              style={{
                margin: '0 0 10px 0',
                fontSize: '14px',
                color: '#4b5563',
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
              }}
            >
              <strong style={{ color: '#111827' }}>📞 Phone:</strong>
              <span>
                {item.countryCode && <span style={{ color: '#6b7280', marginRight: '4px' }}>{item.countryCode}</span>}
                {item.phoneNumber}
              </span>
            </p>
          )}

          {/* Website */}
          {item.website && (
            <p
              style={{
                margin: '0 0 10px 0',
                fontSize: '14px',
                color: '#4b5563',
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
              }}
            >
              <strong style={{ color: '#111827' }}>🌐 Website:</strong>
              <a
                href={item.website}
                target="_blank"
                rel="noopener noreferrer"
                style={{ color: '#2563eb', textDecoration: 'underline' }}
              >
                Visit Website
              </a>
            </p>
          )}

          {/* Coordinates */}
          {item.latitude && item.longitude && (
            <p
              style={{
                margin: '0 0 10px 0',
                fontSize: '12px',
                color: '#6b7280',
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
                fontFamily: 'monospace',
              }}
            >
              <strong style={{ color: '#4b5563' }}>📍 Coords:</strong>
              <span>{item.latitude.toFixed(4)}, {item.longitude.toFixed(4)}</span>
            </p>
          )}

          {/* Description */}
          {item.description && (
            <p
              style={{
                margin: '0 0 10px 0',
                fontSize: '14px',
                color: '#374151',
                lineHeight: '1.6',
              }}
            >
              {item.description}
            </p>
          )}

          {/* Status Badge */}
          {item.status && (
            <></>
          )}

          {/* Gallery Count */}
          {item.gallery && item.gallery.length > 1 && (
            <></>
          )}
        </div>
      </div>
    </div>
  )
}
