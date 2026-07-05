import { PublicChrome } from "@/components/layout/PublicChrome";

export const dynamic = "force-static";
export const revalidate = 3600;

export default function PublicLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return <PublicChrome>{children}</PublicChrome>;
}
