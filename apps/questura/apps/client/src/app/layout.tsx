import type { Metadata } from "next";
import { Geist, Geist_Mono, Roboto } from "next/font/google";
import "./globals.css";
import Navbar from "../components/layout/Navbar";
import { Navbar as NewNavbar } from "../features/Navigation";
import LoginModalRenderer from "../components/layout/LoginModalRenderer";
import PasswordResetModalRenderer from "../components/layout/PasswordResetModalRenderer";
import UserModalRenderer from "../components/layout/UserModalRenderer";
import MenuModalRenderer from "../components/layout/MenuModalRenderer";
import { QueryProvider } from "../components/providers/QueryProvider";

const geistSans = Geist({ variable: "--font-geist-sans", subsets: ["latin"] });
const geistMono = Geist_Mono({ variable: "--font-geist-mono", subsets: ["latin"] });
const roboto = Roboto({ variable: "--font-roboto", weight: ["400", "500", "700"], subsets: ["latin"] });

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
        className={`${geistSans.variable} ${geistMono.variable} ${roboto.variable} antialiased`}
      >
        <div className="min-w-[280px] overflow-x-hidden">
          <QueryProvider>
            <NewNavbar />
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
