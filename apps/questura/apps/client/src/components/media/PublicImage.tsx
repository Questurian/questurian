import type { CSSProperties, ReactEventHandler, Ref } from "react";

import { buildSrcSet } from "@/components/media/imageSrcSet";

export type PublicImageProps = {
  src: string;
  alt?: string | null;
  width: number;
  height: number;
  sizes: string;
  className?: string;
  style?: CSSProperties;
  priority?: boolean;
  loading?: "eager" | "lazy";
  decoding?: "async" | "auto" | "sync";
  fetchPriority?: "high" | "low" | "auto";
  imgRef?: Ref<HTMLImageElement>;
  onLoad?: ReactEventHandler<HTMLImageElement>;
  onError?: ReactEventHandler<HTMLImageElement>;
};

export function PublicImage({
  alt,
  decoding = "async",
  fetchPriority,
  imgRef,
  loading,
  priority = false,
  sizes,
  src,
  width,
  ...props
}: PublicImageProps) {
  const srcSet = buildSrcSet(src);

  return (
    /* eslint-disable-next-line @next/next/no-img-element */
    <img
      {...props}
      ref={imgRef}
      alt={alt ?? ""}
      decoding={decoding}
      fetchPriority={priority ? "high" : fetchPriority ?? "auto"}
      loading={priority ? "eager" : loading ?? "lazy"}
      src={src}
      srcSet={srcSet}
      /* `sizes` without `srcSet` is inert: the browser ignores it and takes the
         only file on offer. Emit the pair or neither, never a value that reads
         as if it were steering something. */
      sizes={srcSet ? sizes : undefined}
      width={width}
    />
  );
}
