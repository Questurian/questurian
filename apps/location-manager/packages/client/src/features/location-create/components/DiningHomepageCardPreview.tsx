import type { CSSProperties } from "react";
import type { LocationResponse } from "../../../shared/services/api/types";
import { mapLocationToDiningHomepageCardPreview } from "./dining-homepage-card-preview.utils";

interface DiningHomepageCardPreviewProps {
  location: LocationResponse;
}

const questuraFontFallbacks = {
  "--font-editorial-serif": "Georgia, serif",
  "--font-dm-sans": "Inter, system-ui, sans-serif",
} as CSSProperties;

export function DiningHomepageCardPreview({ location }: DiningHomepageCardPreviewProps) {
  const preview = mapLocationToDiningHomepageCardPreview(location);

  return (
    <article
      className="relative h-28 w-full overflow-hidden bg-[#1a1a1a] sm:h-36 lg:h-40"
      style={questuraFontFallbacks}
    >
      {preview.imageUrl ? (
        <img
          src={preview.imageUrl}
          alt={preview.alt}
          className="absolute inset-0 h-full w-full object-cover"
          loading="lazy"
        />
      ) : (
        <div className="absolute inset-0 flex items-center justify-center bg-[#1a1a1a]">
          <span className="rounded border border-white/20 bg-white/10 px-3 py-1 text-[0.68rem] font-semibold uppercase tracking-[0.12em] text-white/75">
            Missing image
          </span>
        </div>
      )}

      <div
        className="absolute inset-0"
        style={{
          background:
            "linear-gradient(to top, rgba(0,0,0,0.72) 0%, rgba(0,0,0,0.18) 55%, transparent 100%)",
        }}
        aria-hidden="true"
      />

      <div className="absolute bottom-0 left-0 px-5 pb-5">
        <p className="font-editorial font-[family-name:var(--font-editorial-serif)] text-[2rem] font-bold leading-none text-white">
          {preview.title}
        </p>
        {preview.subtitle ? (
          <p className="mt-1 font-[family-name:var(--font-dm-sans)] text-[0.7rem] font-semibold uppercase tracking-[0.1em] text-white/70">
            {preview.subtitle}
          </p>
        ) : null}
      </div>
    </article>
  );
}
