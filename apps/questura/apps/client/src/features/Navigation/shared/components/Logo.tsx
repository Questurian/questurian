"use client";

interface LogoProps {
  className?: string;
  subtitle?: string;
  subtitleClassName?: string;
  /** Use in toolbars: single line, no centered block wrapper (pairs cleanly with icons). */
  variant?: "default" | "inline";
}

export default function Logo({
  className = "",
  subtitle = "",
  subtitleClassName = "",
  variant = "default",
}: LogoProps) {
  const isInline = variant === "inline";
  const wrapClass = isInline ? "inline-flex min-w-0 items-center" : "text-center";

  return (
    <div className={wrapClass}>
      <h1
        className={`
          font-display text-[#25292d] uppercase font-semibold leading-none m-0 p-0
          ${isInline ? "text-left" : ""}
          ${className}
        `}
        style={
          isInline
            ? undefined
            : {
                // font-size: 2.9rem (full) → 1.5rem (compact), delta = 1.4rem
                // letter-spacing: 0.12em (full) → 0.08em (compact), delta = 0.04em
                // --navbar-collapse is 0 at top, 1 when fully scrolled.
                // No CSS transition — the variable itself is frame-accurate.
                fontSize: "calc(2.9rem - var(--navbar-collapse, 0) * 1.4rem)",
                letterSpacing:
                  "calc(0.12em - var(--navbar-collapse, 0) * 0.04em)",
              }
        }
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
