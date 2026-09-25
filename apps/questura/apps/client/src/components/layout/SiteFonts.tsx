import { Suspense } from "react";
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
      {/*
       * Not a loading state: nothing here suspends on the server, so the
       * fallback is never sent. It keeps a client component from sitting
       * directly under this <div> (launch fix plan item 8). The site chrome
       * below is a client component whose code can finish loading in the
       * middle of hydration. React then replays the parent fiber, and when
       * that parent is a DOM element it is hydrated a second time with the
       * cursor already inside it (React 19.1 and 19.2 do not rewind it): it
       * claims its own first child as itself, and the page is thrown away
       * and rendered again. That was minified React error #418 on about one
       * fast /account load in seventy (the same happened one level up, in
       * app/layout.tsx). Under a boundary the replayed fiber is the
       * boundary's, which claims nothing.
       */}
      <Suspense fallback={null}>{children}</Suspense>
    </div>
  );
}
