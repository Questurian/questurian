import JoinNavbar from "@/features/Navigation/JoinNavbar";

export const dynamic = "force-static";
export const revalidate = 3600;

export default function JoinLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <>
      <JoinNavbar />
      <main className="flex-1">{children}</main>
    </>
  );
}
