"use client";

/**
 * Flag for an ISO 3166-1 alpha-2 country code.
 *
 * SVGs are served straight from `public/flags` (synced from `country-flag-icons`
 * by `pnpm run sync:flags`) — no runtime API call, one cacheable request per
 * flag actually shown. An unknown or missing code renders nothing so callers can
 * pass the server's nullable `countryCode` through unguarded.
 */
export default function CountryFlag({
  code,
  countryName,
  className = "",
}: {
  code: string | null | undefined;
  countryName?: string;
  className?: string;
}) {
  if (!code || !/^[A-Za-z]{2}$/.test(code)) return null;

  const upper = code.toUpperCase();

  return (
    // eslint-disable-next-line @next/next/no-img-element -- static local SVG; next/image adds no value and would route it through the optimizer.
    <img
      src={`/flags/${upper}.svg`}
      alt={countryName ? `${countryName} flag` : ""}
      aria-hidden={countryName ? undefined : true}
      width={30}
      height={20}
      loading="lazy"
      decoding="async"
      className={`inline-block shrink-0 object-cover ${className}`}
    />
  );
}
