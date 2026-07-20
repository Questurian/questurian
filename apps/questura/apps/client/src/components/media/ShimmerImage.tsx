'use client'

import { useEffect, useRef, useState, type JSX } from 'react'
import { PublicImage, type PublicImageProps } from '@/components/media/PublicImage'

type ShimmerImageProps = PublicImageProps & {
  wrapperClassName?: string
}

type ImageState = 'loading' | 'loaded' | 'failed'

export function ShimmerImage({
  src,
  className,
  wrapperClassName,
  onError,
  onLoad,
  ...props
}: ShimmerImageProps): JSX.Element {
  const wrapperRef = useRef<HTMLDivElement>(null)
  const [imageState, setImageState] = useState<ImageState>('loading')

  // Cached images can finish before hydration attaches onLoad. Reconcile
  // after every src change so the shimmer never remains over a ready image.
  useEffect(() => {
    setImageState('loading')
    const image = wrapperRef.current?.querySelector('img')
    if (!image?.complete) return
    setImageState(image.naturalWidth > 0 ? 'loaded' : 'failed')
  }, [src])

  return (
    <div
      ref={wrapperRef}
      className={`shimmer-image ${wrapperClassName ?? ''}`}
      data-image-state={imageState}
    >
      <PublicImage
        {...props}
        src={src}
        className={className}
        onError={(event) => {
          setImageState('failed')
          onError?.(event)
        }}
        onLoad={(event) => {
          setImageState('loaded')
          onLoad?.(event)
        }}
      />
    </div>
  )
}
