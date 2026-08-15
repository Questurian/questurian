import type { Metadata } from "next";
import {
  Cormorant_Garamond,
  Geist,
  Geist_Mono,
  Playfair_Display,
} from "next/font/google";
import "./globals.css";
import { DEFAULT_LOCALE } from "@/lib/i18n/locales";

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
  title: "Questura",
  description: "Curated city guides, travel maps, itineraries, and local recommendations.",
};

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang={DEFAULT_LOCALE} style={{ colorScheme: 'light' }}>
      <body
        className={`${geistSans.variable} ${geistMono.variable} ${playfair.variable} ${editorialSerif.variable} antialiased`}
      >
        <div className="flex min-h-screen min-w-[280px] flex-col overflow-x-clip">
          {children}
        </div>
      </body>
    </html>
  );
}
