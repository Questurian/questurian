import Footer from "@/components/layout/Footer";
import { ClientInteractionProvider } from "@/components/providers/ClientInteractionProvider";
import { Navbar } from "@/features/Navigation";

export const dynamic = "force-static";
export const revalidate = 3600;

export default function PublicLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <>
      <ClientInteractionProvider>
        <Navbar />
      </ClientInteractionProvider>
      <main className="flex-1">{children}</main>
      <Footer />
    </>
  );
}
