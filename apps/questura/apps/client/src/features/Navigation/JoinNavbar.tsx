import Link from "next/link";
import Logo from "./shared/components/Logo";

/**
 * Minimal navbar for the /join funnel: just the wordmark linking home,
 * with none of the menu/auth/subscribe chrome from the main Navbar.
 */
export default function JoinNavbar() {
  return (
    <nav className="sticky top-0 z-40 flex h-[55px] w-full items-center justify-center bg-[#031522] 1024:h-16">
      <Link
        href="/"
        aria-label="Questurian home"
        className="cursor-pointer focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[#78C7E8]"
      >
        <Logo
          variant="inline"
          className="whitespace-nowrap !text-[#F4F0E7] text-[1.35rem] tracking-[0.08em] 1024:text-[1.6rem]"
        />
      </Link>
    </nav>
  );
}
