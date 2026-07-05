import Footer from "@/components/layout/Footer";
import { ClientInteractionProvider } from "@/components/providers/ClientInteractionProvider";
import { JsonLd } from "@/components/seo/JsonLd";
import { Navbar } from "@/features/Navigation";
import { buildOrganizationJsonLd } from "@/lib/seo/organizationJsonLd";

export function PublicChrome({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <>
      <JsonLd data={buildOrganizationJsonLd()} />
      <ClientInteractionProvider>
        <Navbar />
      </ClientInteractionProvider>
      <main className="flex-1">{children}</main>
      <Footer />
    </>
  );
}
