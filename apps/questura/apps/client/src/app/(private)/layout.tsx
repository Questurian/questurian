import Footer from "@/components/layout/Footer";
import { ClientInteractionProvider } from "@/components/providers/ClientInteractionProvider";
import { AffiliateTracking } from "@/components/providers/AffiliateTracking";
import { Navbar } from "@/features/Navigation";
import { SiteFonts } from "@/components/layout/SiteFonts";
import { getLocationMenu } from "@/features/Navigation/lib/getLocationMenu";

export const dynamic = "force-dynamic";

export default async function MainLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const locationMenu = await getLocationMenu();

  return (
    <SiteFonts>
      <ClientInteractionProvider locationMenu={locationMenu}>
        <AffiliateTracking />
        <Navbar />
        <main className="flex-1 ">{children}</main>
        <Footer />
      </ClientInteractionProvider>
    </SiteFonts>
  );
}
