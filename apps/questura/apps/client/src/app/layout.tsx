import type { Metadata } from "next";
import {
  Cormorant_Garamond,
  Geist,
  Geist_Mono,
  Playfair_Display,
} from "next/font/google";
import "./globals.css";
import { DEFAULT_LOCALE } from "@/lib/i18n/locales";
import { IMAGE_CDN_ORIGIN } from "@/lib/media/imageCdnOrigin";
import { NavigationFeedback } from "@/components/navigation/NavigationFeedback";
import { WebVitals } from "@/components/observability/WebVitals";
import { IDENTITY_HINT_SCRIPT } from "@/lib/user/identityHint";
import { getBackendUrl } from "@/lib/api/api-config";
import { getPublicBaseUrl } from "@/lib/seo/publicBaseUrl";

/*
 * Only the families every route renders belong here: next/font preloads a
 * family on every route whose module graph loads it. DM Sans and Roboto are
 * declared in SiteFonts, which the site route groups mount but /join does
 * not.
 */
const geistSans = Geist({ variable: "--font-geist-sans", subsets: ["latin"] });
const geistMono = Geist_Mono({ variable: "--font-geist-mono", subsets: ["latin"] });
const playfair = Playfair_Display({
  variable: "--font-display",
  weight: ["400", "500", "600", "700"],
  subsets: ["latin"],
});
const editorialSerif = Cormorant_Garamond({
  variable: "--font-editorial-serif",
  weight: ["400", "500", "600", "700"],
  subsets: ["latin"],
});
export const metadata: Metadata = {
  // Resolves every relative canonical and og:url against the site's own
  // address. Without it they stayed relative, so a copy of the site served
  // from another host (a *.workers.dev URL, say) named itself as canonical.
  metadataBase: new URL(getPublicBaseUrl()),
  title: "Questura",
  description: "Curated city guides, travel maps, itineraries, and local recommendations.",
};

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    // The pre-paint hint below sets `data-identity` before React hydrates.
    <html lang={DEFAULT_LOCALE} style={{ colorScheme: 'light' }} suppressHydrationWarning>
      <head>
        {/* Before first paint: which navbar controls this reader will get
            (lib/user/identityHint.ts). Must run ahead of the body. */}
        <script dangerouslySetInnerHTML={{ __html: IDENTITY_HINT_SCRIPT }} />
      </head>
      {/* Every photo on the site is served from the image CDN, so a cold visit
          otherwise pays DNS + TLS against a second origin before the first
          image byte moves. Next hoists a plain <link> in JSX into <head>. */}
      {IMAGE_CDN_ORIGIN ? <link rel="preconnect" href={IMAGE_CDN_ORIGIN} /> : null}
      {/* Every page asks the API host `/api/me` with credentials. A preconnect
          in anonymous mode would open a socket the credentialed fetch cannot
          reuse, so this one says use-credentials. */}
      <link rel="preconnect" href={new URL(getBackendUrl()).origin} crossOrigin="use-credentials" />
      <body
        className={`${geistSans.variable} ${geistMono.variable} ${playfair.variable} ${editorialSerif.variable} antialiased`}
      >
        <div className="flex min-h-screen min-w-[280px] flex-col overflow-x-clip">
          {children}
        </div>
        <NavigationFeedback />
        <WebVitals />
      </body>
    </html>
  );
}
