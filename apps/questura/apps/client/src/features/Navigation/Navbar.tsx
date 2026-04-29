"use client";

import DesktopNavbar from "./Desktop/DesktopNavbar";
import MobileNavbar from "./Mobile/MobileNavbar";
import { useEffect, useState } from "react";

export default function Navbar() {
  // Prevent hydration mismatch by only showing auth state after mount
  const [hasMounted, setHasMounted] = useState(false);
  useEffect(() => {
    setHasMounted(true);
  }, []);

  // Don't render any auth-dependent UI until mounted on client
  // This prevents hydration mismatches between server and client
  if (!hasMounted) {
    return (
      <nav className="h-[55px] w-full animate-pulse bg-[#ece9e3] 1024:h-24" />
    );
  }

  return (
    <nav>
      <div className="hidden 1024:block">
        <DesktopNavbar />
      </div>
      <div className="h-[55px] 1024:hidden">
        <MobileNavbar />
      </div>
    </nav>
  );
}
