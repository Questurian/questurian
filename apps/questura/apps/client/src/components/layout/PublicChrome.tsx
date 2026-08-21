import Footer from "@/components/layout/Footer";
import { ClientInteractionProvider } from "@/components/providers/ClientInteractionProvider";
import { JsonLd } from "@/components/seo/JsonLd";
import { Navbar } from "@/features/Navigation";
import { buildOrganizationJsonLd } from "@/lib/seo/organizationJsonLd";
import { getLocationMenu } from "@/features/Navigation/lib/getLocationMenu";

export async function PublicChrome({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const locationMenu = await getLocationMenu();

  return (
    <>
      <JsonLd data={buildOrganizationJsonLd()} />
      <ClientInteractionProvider locationMenu={locationMenu}>
        <Navbar />
      </ClientInteractionProvider>
      <main className="flex-1">{children}</main>
      <Footer />
    </>
  );
}
