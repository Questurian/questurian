"use client";

interface LogoProps {
  className?: string;
  subtitle?: string;
  subtitleClassName?: string;
}

export default function Logo({
  className = "",
  subtitle = "",
  subtitleClassName = "",
}: LogoProps) {
  return (
    <div className="text-center">
      <h1
        className={`
          font-display text-[#25292d] uppercase font-semibold leading-none m-0 p-0
          tracking-[0.12em] text-[1.25rem]
          480:text-[1.4rem]
          550:text-[1.55rem]
          1024:text-[2.9rem]
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
