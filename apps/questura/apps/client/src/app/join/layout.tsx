import JoinNavbar from "@/features/Navigation/JoinNavbar";
import { QueryProvider } from "@/components/providers/QueryProvider";
import {
  GLOBE_FALLBACK_SRC,
  GLOBE_SIZES,
  GLOBE_SRCSET,
} from "@/features/Payments/components/joinHeroGlobe";

export const dynamic = "force-static";
export const revalidate = 3600;

export default function JoinLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <>
      {/*
       * The globe is the hero's LCP image and gates the enter animation, so
       * start it with the document instead of waiting for the parser to reach
       * the <img>. React hoists this into <head>.
       */}
      <link
        rel="preload"
        as="image"
        href={GLOBE_FALLBACK_SRC}
        imageSrcSet={GLOBE_SRCSET}
        imageSizes={GLOBE_SIZES}
        fetchPriority="high"
      />
      <JoinNavbar />
      {/*
       * Plan cards read advertised catalog prices ($12.99 / $79.99) from
       * /api/payments/plans, so this static route still needs a query client.
       * Laptop may charge $0.50. See docs/membership-pricing.md.
       */}
      <QueryProvider>
        <main className="flex-1">{children}</main>
      </QueryProvider>
    </>
  );
}
