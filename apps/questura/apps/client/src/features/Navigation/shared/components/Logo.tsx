"use client";

interface LogoProps {
  className?: string;
  subtitle?: string;
  subtitleClassName?: string;
  /** Use in toolbars: single line, no centered block wrapper (pairs cleanly with icons). */
  variant?: "default" | "inline";
  /** Shrinks logo to compact size for scrolled desktop navbar. */
  compact?: boolean;
}

export default function Logo({
  className = "",
  subtitle = "",
  subtitleClassName = "",
  variant = "default",
  compact = false,
}: LogoProps) {
  const isInline = variant === "inline";
  const wrapClass = isInline ? "inline-flex min-w-0 items-center" : "text-center";
  /* Inline logos pass all font sizes via `className`. Default sizes here fight those utilities below `380:` because Tailwind does not guarantee HTML class order for conflicts. */
  const displayTypeScale = isInline
    ? ""
    : compact
    ? `
          tracking-[0.08em] text-[1.25rem]
          1024:text-[1.5rem]
        `
    : `
          tracking-[0.12em] text-[1.25rem]
          480:text-[1.4rem]
          550:text-[1.55rem]
          1024:text-[2.9rem]
        `;

  return (
    <div className={wrapClass}>
      <h1
        className={`
          font-display text-[#25292d] uppercase font-semibold leading-none m-0 p-0
          transition-[font-size,letter-spacing] duration-300 ease-in-out
          ${displayTypeScale}
          ${isInline ? "text-left" : ""}
          ${className}
        `}
      >
        Questurian
      </h1>
      {subtitle ? (
        <p
          className={`
            font-display italic text-[#6b6a68] mt-1
            text-[0.82rem]
            550:text-[0.95rem]
            1024:text-[1.4rem]
            ${subtitleClassName}
          `}
        >
          {subtitle}
        </p>
      ) : null}
    </div>
  );
}
