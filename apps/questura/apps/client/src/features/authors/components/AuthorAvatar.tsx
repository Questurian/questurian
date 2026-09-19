"use client";

import { useEffect, useRef, useState, type JSX } from "react";
import { PublicImage } from "@/components/media/PublicImage";

const AVATAR_SIZE = {
  page: "size-[88px] sm:size-[104px] lg:size-[112px]",
  article: "size-[72px] 480:size-[80px] sm:size-[88px]",
} as const;

/** The same widths as AVATAR_SIZE, restated for the browser's rung picker. */
const AVATAR_IMAGE_SIZES = {
  page: "(min-width: 1024px) 112px, (min-width: 640px) 104px, 88px",
  article: "(min-width: 640px) 88px, (min-width: 480px) 80px, 72px",
} as const;

function AvatarPlaceholder({ size }: { size: keyof typeof AVATAR_SIZE }): JSX.Element {
  return (
    <div
      aria-hidden="true"
      className={`flex shrink-0 items-center justify-center bg-paper ${AVATAR_SIZE[size]}`}
    >
      <svg
        viewBox="0 0 24 24"
        fill="none"
        className="size-[55%] text-foreground/35"
        aria-hidden="true"
      >
        <circle cx="12" cy="8" r="4" fill="currentColor" />
        <path d="M4 21c0-4.4 3.6-7 8-7s8 2.6 8 7" fill="currentColor" />
      </svg>
    </div>
  );
}

/**
 * Author profile photo with the same shimmer-placeholder → fade-in treatment
 * as the homepage block images (see .city-article-image-shell in globals.css).
 */
export function AuthorAvatar({
  avatar,
  name,
  size = "page",
}: {
  /**
   * Widened past `PublicAuthor["avatar"]`: article bylines carry the same
   * shape with `alt` optional, and the API genuinely omits it. The render
   * already falls back to a generated alt, so requiring the key bought
   * nothing but a type error at the article call sites.
   */
  avatar?: { url: string; alt?: string | null } | null;
  name: string;
  size?: keyof typeof AVATAR_SIZE;
}): JSX.Element {
  const imageRef = useRef<HTMLImageElement | null>(null);
  const [status, setStatus] = useState<"loading" | "loaded" | "failed">(
    avatar?.url ? "loading" : "failed",
  );

  // Reconcile images that finished loading before hydration attached onLoad,
  // otherwise the image can stay stuck at opacity-0 after an SSR render.
  useEffect(() => {
    setStatus(avatar?.url ? "loading" : "failed");
    const image = imageRef.current;
    if (!avatar?.url || !image) return;
    if (image.complete && image.naturalWidth > 0) {
      setStatus("loaded");
    }
  }, [avatar?.url]);

  if (!avatar?.url || status === "failed") {
    return <AvatarPlaceholder size={size} />;
  }

  return (
    <div
      className={`author-avatar-shell relative shrink-0 overflow-hidden bg-paper ${AVATAR_SIZE[size]}`}
      data-image-loaded={status === "loaded" ? "true" : "false"}
    >
      <PublicImage
        imgRef={imageRef}
        src={avatar.url}
        alt={avatar.alt ?? `${name} profile photo`}
        className={`relative z-10 h-full w-full object-cover transition-opacity duration-500 ${status === "loaded" ? "opacity-100" : "opacity-0"}`}
        fetchPriority="high"
        decoding="async"
        onLoad={() => setStatus("loaded")}
        onError={() => setStatus("failed")}
        sizes={AVATAR_IMAGE_SIZES[size]}
      />
    </div>
  );
}
