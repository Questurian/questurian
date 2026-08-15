import Footer from "@/components/layout/Footer";
import { ClientInteractionProvider } from "@/components/providers/ClientInteractionProvider";
import { AffiliateTracking } from "@/components/providers/AffiliateTracking";
import { Navbar } from "@/features/Navigation";
import { SiteFonts } from "@/components/layout/SiteFonts";

export const dynamic = "force-dynamic";

export default function MainLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <SiteFonts>
      <ClientInteractionProvider>
        <AffiliateTracking />
        <Navbar />
        <main className="flex-1 ">{children}</main>
        <Footer />
      </ClientInteractionProvider>
    </SiteFonts>
  );
}
