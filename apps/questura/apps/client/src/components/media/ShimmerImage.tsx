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

  // The image is opaque from the first paint and sits above the shimmer, so
  // this state never decides whether it is visible (#594). It only stops the
  // shimmer animation and styles a failure. Cached images can finish before
  // hydration attaches onLoad, so reconcile after every src change too —
  // otherwise the shimmer would keep animating under a ready image.
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
