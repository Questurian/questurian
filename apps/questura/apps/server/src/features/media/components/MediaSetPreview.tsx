'use client'

import React from 'react'
import { useField } from '@payloadcms/ui'
import { getMediaSetPreviewAsset } from '@/features/media/lib/media-set-preview'

type Props = {
  path: string
  field: {
    label?: string
  }
}

const MediaSetPreview: React.FC<Props> = ({ path }) => {
  const mediaSetPath = path.replace(/\.[^.]+$/, '.image')
  const { value } = useField<unknown>({ path: mediaSetPath })

  const mediaSetId = React.useMemo(() => {
    if (typeof value === 'string' || typeof value === 'number') return value
    if (typeof value === 'object' && value && 'id' in value) {
      const idValue = (value as { id?: unknown }).id
      if (typeof idValue === 'string' || typeof idValue === 'number') return idValue
    }
    return null
  }, [value])

  const [imageUrl, setImageUrl] = React.useState<string | null>(null)
  const [imageAlt, setImageAlt] = React.useState<string>('Media set preview')
  const [loading, setLoading] = React.useState(false)

  const addCacheBuster = React.useCallback((url: string, token: string | number | null) => {
    if (!token) return url
    const separator = url.includes('?') ? '&' : '?'
    return `${url}${separator}v=${encodeURIComponent(String(token))}`
  }, [])

  React.useEffect(() => {
    if (!mediaSetId) {
      setImageUrl(null)
      return
    }

    const fetchPreview = async () => {
      setLoading(true)
      try {
        const response = await fetch(`/api/media-sets/${mediaSetId}?depth=2`)
        if (response.ok) {
          const doc = await response.json()
          const previewAsset = getMediaSetPreviewAsset(doc)
          const cacheToken =
            (typeof previewAsset?.updatedAt === 'string' && previewAsset.updatedAt) ||
            previewAsset?.id ||
            (typeof doc.updatedAt === 'string' ? doc.updatedAt : null)

          setImageUrl(previewAsset?.url ? addCacheBuster(previewAsset.url, cacheToken) : null)
          setImageAlt(previewAsset?.alt_text ?? doc.alt_text ?? doc.title ?? 'Media set preview')
        }
      } catch (error) {
        console.error('Error fetching media set preview:', error)
      }
      setLoading(false)
    }

    fetchPreview()
  }, [addCacheBuster, mediaSetId])

  if (!mediaSetId) return null

  return (
    <div style={{ marginTop: '10px', marginBottom: '10px' }}>
      {loading && <div style={{ fontSize: '12px', color: '#888' }}>Loading preview...</div>}

      {imageUrl && (
        <div
          style={{
            width: '100px',
            height: '100px',
            borderRadius: '4px',
            overflow: 'hidden',
            border: '1px solid #eee',
            position: 'relative',
          }}
        >
          <img
            src={imageUrl}
            alt={imageAlt}
            style={{ width: '100%', height: '100%', objectFit: 'cover' }}
          />
        </div>
      )}

      {!imageUrl && !loading && (
        <div style={{ fontSize: '12px', color: '#888', fontStyle: 'italic' }}>
          No preview image set
        </div>
      )}
    </div>
  )
}

export default MediaSetPreview
