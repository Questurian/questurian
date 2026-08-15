import { PublicChrome } from "@/components/layout/PublicChrome";
import { SiteFonts } from "@/components/layout/SiteFonts";

export const dynamic = "force-static";
export const revalidate = 3600;

export default function PublicLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <SiteFonts>
      <PublicChrome>{children}</PublicChrome>
    </SiteFonts>
  );
}
