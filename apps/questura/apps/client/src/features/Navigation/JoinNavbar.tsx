import Link from "next/link";
import Logo from "./shared/components/Logo";

/**
 * Minimal navbar for the /join funnel: just the wordmark linking home,
 * with none of the menu/auth/subscribe chrome from the main Navbar.
 */
export default function JoinNavbar() {
  return (
    <nav className="sticky top-0 z-40 flex h-[55px] w-full items-center justify-center border-b border-[#1A1A1A]/15 bg-[#F5F0E8] 1024:h-16">
      <Link
        href="/"
        aria-label="Questurian home"
        className="cursor-pointer"
      >
        <Logo
          variant="inline"
          className="whitespace-nowrap text-[1.35rem] tracking-[0.08em] 1024:text-[1.6rem]"
        />
      </Link>
    </nav>
  );
}
