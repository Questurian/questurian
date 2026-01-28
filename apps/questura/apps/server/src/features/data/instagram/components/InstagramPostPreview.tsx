'use client'

import React from 'react'
import { useField } from '@payloadcms/ui'

// Since we need to fetch the related document to get the image URL,
// we'll create a component that uses the relationship value (ID) to fetch the previewImage.

type Props = {
  path: string
  field: {
    label?: string
  }
}

const InstagramPostPreview: React.FC<Props> = (props) => {
  const { path } = props
  
  // We are using this component in a UI field named 'preview' (or similar)
  // which is a sibling to the actual relationship field named 'post'.
  // We need to derive the path to the 'post' field to get its value.
  const postPath = path.replace(/\.[^.]+$/, '.post')
  
  const { value } = useField<string>({ path: postPath }) // The value of the relationship field is the ID

  // State to hold the image URL
  const [imageUrl, setImageUrl] = React.useState<string | null>(null)
  const [loading, setLoading] = React.useState(false)

  React.useEffect(() => {
    if (!value) {
      setImageUrl(null)
      return
    }

    const fetchPreview = async () => {
      setLoading(true)
      try {
        // Fetch the Instagram Post document by ID
        const response = await fetch(`/api/instagram-posts/${value}`)
        if (response.ok) {
          const doc = await response.json()
          // Check if there is a previewImage
          if (doc.previewImage && typeof doc.previewImage === 'object' && doc.previewImage.url) {
             setImageUrl(doc.previewImage.url)
          } else if (doc.previewImage && typeof doc.previewImage === 'string') {
             // If it's just an ID, we'd technically need to fetch that too, but usually API returns populated depth=0 or 1
             // For now assume depth is enough or it's an object
          }
        }
      } catch (e) {
        console.error('Error fetching Instagram preview:', e)
      }
      setLoading(false)
    }

    fetchPreview()
  }, [value])

  if (!value) return null

  return (
    <div style={{ marginTop: '10px', marginBottom: '10px' }}>
      {loading && <div style={{ fontSize: '12px', color: '#888' }}>Loading preview...</div>}
      
      {imageUrl && (
        <div style={{ 
          width: '100px', 
          height: '100px', 
          borderRadius: '4px', 
          overflow: 'hidden',
          border: '1px solid #eee',
          position: 'relative'
        }}>
          <img 
            src={imageUrl} 
            alt="Instagram Post Preview" 
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

export default InstagramPostPreview
