import type { CSSProperties, ReactEventHandler } from "react";

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
  onLoad?: ReactEventHandler<HTMLImageElement>;
  onError?: ReactEventHandler<HTMLImageElement>;
};

export function PublicImage({
  alt,
  decoding = "async",
  fetchPriority,
  loading,
  priority = false,
  ...props
}: PublicImageProps) {
  return (
    /* eslint-disable-next-line @next/next/no-img-element */
    <img
      alt={alt ?? ""}
      decoding={decoding}
      fetchPriority={priority ? "high" : fetchPriority ?? "auto"}
      loading={priority ? "eager" : loading ?? "lazy"}
      {...props}
    />
  );
}
