'use client'

import Image from 'next/image'

interface MediaAsset {
  id: string
  filename?: string
  width?: number
  height?: number
  mimeType?: string
}

interface ImageBlockProps {
  image: string | MediaAsset
  alt: string
}

const BUNNY_CDN_URL = process.env.NEXT_PUBLIC_BUNNY_CDN_URL || 'https://questurian-cdn.b-cdn.net/media'

export const ImageBlock: React.FC<ImageBlockProps> = ({ image, alt }) => {
  const filename = typeof image === 'string' ? image : image.filename || ''

  if (!filename) {
    return null
  }

  const imageUrl = `${BUNNY_CDN_URL}/${filename}`
  const responsiveUrl = `${BUNNY_CDN_URL}/${filename}?width=800&aspect_ratio=16:9`

  return (
    <figure className="my-8 w-full">
      <picture>
        {/* Mobile: 400px */}
        <source
          media="(max-width: 768px)"
          srcSet={`${BUNNY_CDN_URL}/${filename}?width=400&aspect_ratio=16:9`}
        />
        {/* Tablet: 600px */}
        <source
          media="(max-width: 1024px)"
          srcSet={`${BUNNY_CDN_URL}/${filename}?width=600&aspect_ratio=16:9`}
        />
        {/* Desktop: 800px */}
        <source
          media="(min-width: 1025px)"
          srcSet={responsiveUrl}
        />
        <img
          src={responsiveUrl}
          alt={alt}
          loading="lazy"
          className="w-full h-auto rounded-lg"
        />
      </picture>
    </figure>
  )
}
