import type { Metadata } from "next";
import {
  Cormorant_Garamond,
  DM_Sans,
  Geist,
  Geist_Mono,
  Playfair_Display,
  Roboto,
} from "next/font/google";
import "./globals.css";
import { DEFAULT_LOCALE } from "@/lib/i18n/locales";

const geistSans = Geist({ variable: "--font-geist-sans", subsets: ["latin"] });
const geistMono = Geist_Mono({ variable: "--font-geist-mono", subsets: ["latin"] });
const roboto = Roboto({ variable: "--font-roboto", weight: ["400", "500", "700"], subsets: ["latin"] });
const dmSans = DM_Sans({ variable: "--font-dm-sans", subsets: ["latin"] });
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
        className={`${geistSans.variable} ${geistMono.variable} ${roboto.variable} ${dmSans.variable} ${playfair.variable} ${editorialSerif.variable} antialiased`}
      >
        <div className="flex min-h-screen min-w-[280px] flex-col overflow-x-clip">
          {children}
        </div>
      </body>
    </html>
  );
}
