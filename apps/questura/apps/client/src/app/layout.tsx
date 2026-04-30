import type { Metadata } from "next";
import { Geist, Geist_Mono, Roboto, DM_Sans, Cormorant_Garamond } from "next/font/google";
import "./globals.css";
import LoginModalRenderer from "../components/layout/LoginModalRenderer";
import PasswordResetModalRenderer from "../components/layout/PasswordResetModalRenderer";
import UserModalRenderer from "../components/layout/UserModalRenderer";
import MenuModalRenderer from "../components/layout/MenuModalRenderer";
import { QueryProvider } from "../components/providers/QueryProvider";

const geistSans = Geist({ variable: "--font-geist-sans", subsets: ["latin"] });
const geistMono = Geist_Mono({ variable: "--font-geist-mono", subsets: ["latin"] });
const roboto = Roboto({ variable: "--font-roboto", weight: ["400", "500", "700"], subsets: ["latin"] });
const dmSans = DM_Sans({ variable: "--font-dm-sans", subsets: ["latin"] });
const editorialSerif = Cormorant_Garamond({
  variable: "--font-editorial-serif",
  weight: ["400", "500", "600", "700"],
  subsets: ["latin"],
});
export const metadata: Metadata = {
  title: "Secure Payments | Google OAuth & Stripe Integration",
  description: "Manage your account, subscriptions, and payments securely with Google OAuth and Stripe integration",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" style={{ colorScheme: 'light' }}>
      <link rel="preconnect" href="https://fonts.googleapis.com" />
      <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
      <link href="https://fonts.googleapis.com/css2?family=Playfair+Display:ital,wght@0,400;0,500;0,600;0,700;1,400;1,500&display=swap" rel="stylesheet" />
      <head>
        {/* Endorsely Affiliate Tracking Script - Only load if feature enabled */}
        {process.env.NEXT_PUBLIC_ENDORSELY_ENABLED === 'true' && (
          <script
            async
            src="https://assets.endorsely.com/endorsely.js"
            data-endorsely={process.env.NEXT_PUBLIC_ENDORSELY_ORG_ID || ""}
          />
        )}
      </head>
      <body
        className={`${geistSans.variable} ${geistMono.variable} ${roboto.variable} ${dmSans.variable} ${editorialSerif.variable} antialiased`}
      >
        <div className="min-w-[280px] overflow-x-hidden">
          <QueryProvider>
            {children}
            <LoginModalRenderer />
            <PasswordResetModalRenderer />
            <UserModalRenderer />
            <MenuModalRenderer />
          </QueryProvider>
        </div>
      </body>
    </html>
  );
}
