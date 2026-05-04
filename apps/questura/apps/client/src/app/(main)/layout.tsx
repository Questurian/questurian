import { Navbar } from "../../features/Navigation";
import Footer from "@/components/layout/Footer";

export const dynamic = "force-dynamic";

export default function MainLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <>
      <Navbar />
      <main className="flex-1">{children}</main>
      <Footer />
    </>
  );
}
