import Script from "next/script";

export function AffiliateTracking() {
  if (process.env.NEXT_PUBLIC_ENDORSELY_ENABLED !== "true") {
    return null;
  }

  return (
    <Script
      src="https://assets.endorsely.com/endorsely.js"
      data-endorsely={process.env.NEXT_PUBLIC_ENDORSELY_ORG_ID || ""}
      strategy="afterInteractive"
    />
  );
}
