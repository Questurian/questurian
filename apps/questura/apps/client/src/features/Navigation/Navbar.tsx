"use client";

import DesktopNavbar from "./Desktop/DesktopNavbar";
import MobileNavbar from "./Mobile/MobileNavbar";
import { useEffect, useState } from "react";

export default function Navbar() {
  const [hasMounted, setHasMounted] = useState(false);
  const [isScrolled, setIsScrolled] = useState(false);

  useEffect(() => {
    setHasMounted(true);
    const handleScroll = () => setIsScrolled(window.scrollY > 10);
    window.addEventListener("scroll", handleScroll, { passive: true });
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  if (!hasMounted) {
    return (
      <nav className="sticky top-0 z-40 h-[55px] w-full animate-pulse bg-[#ece9e3] 1024:h-24" />
    );
  }

  return (
    <nav className="sticky top-0 z-40">
      <div className="hidden 1024:block">
        <DesktopNavbar isScrolled={isScrolled} />
      </div>
      <div className="h-[55px] 1024:hidden">
        <MobileNavbar />
      </div>
    </nav>
  );
}
