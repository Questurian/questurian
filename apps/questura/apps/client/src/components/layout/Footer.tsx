import Link from "next/link";
import Logo from "@/features/Navigation/shared/components/Logo";

export default function Footer() {
  return (
    <footer className="w-full border-t border-black/10 bg-[#ece9e3]">
      <div className="mx-auto max-w-6xl px-4 py-8 1024:py-12">
        {/* Logo */}
        <div className="mb-6 flex justify-center 1024:justify-start">
          <Link href="/">
            <Logo variant="inline" className="text-[1.25rem] 1024:text-[1.6rem]" />
          </Link>
        </div>

        {/* Links */}
        <div className="flex flex-col items-center gap-4 text-sm text-[#6b6a68] 1024:flex-row 1024:justify-between">
          <nav className="flex flex-wrap justify-center gap-x-6 gap-y-2 1024:justify-start">
            <Link href="/" className="hover:text-[#25292d] transition-colors">
              Home
            </Link>
            <Link href="/join" className="hover:text-[#25292d] transition-colors">
              Subscribe
            </Link>
          </nav>

          <p className="text-xs">
            &copy; {new Date().getFullYear()} Questurian. All rights reserved.
          </p>
        </div>
      </div>
    </footer>
  );
}
