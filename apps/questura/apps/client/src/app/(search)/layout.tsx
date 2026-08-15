import { PublicChrome } from "@/components/layout/PublicChrome";
import { SiteFonts } from "@/components/layout/SiteFonts";

// Same chrome as the (public) group, but rendered dynamically so the
// search page can read query params on the server.
export const dynamic = "force-dynamic";

export default function SearchLayout({
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
