import { DM_Sans, Roboto } from "next/font/google";

/*
 * Fonts used by the site chrome and content routes, but not by the /join
 * funnel.
 *
 * next/font preloads a family on every route whose module graph pulls it in,
 * so declaring these in the root layout put their woff2 files in front of
 * every page — including /join, which renders neither family and was pushing
 * its hero image down the queue behind them. Declared here, they are
 * preloaded only on the routes that mount this wrapper.
 */
const dmSans = DM_Sans({ variable: "--font-dm-sans", subsets: ["latin"] });
const roboto = Roboto({
  variable: "--font-roboto",
  weight: ["400", "500", "700"],
  subsets: ["latin"],
});

/*
 * display: contents keeps the variables inheriting to the whole subtree
 * without the wrapper becoming a flex item of the root layout's column —
 * the navbar, <main> and footer stay direct children of that flex context.
 */
export function SiteFonts({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <div
      className={`${dmSans.variable} ${roboto.variable}`}
      style={{ display: "contents" }}
    >
      {children}
    </div>
  );
}
