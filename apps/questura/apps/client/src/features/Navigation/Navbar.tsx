"use client";

import DesktopNavbar from "./Desktop/DesktopNavbar";
import MobileNavbar from "./Mobile/MobileNavbar";
import { SubNav } from "./components/SubNav";
import { useEffect, useState } from "react";
import Link from "next/link";
import { useAuth, useLogoutMutation } from "@/lib/user/hooks";
import { useLoginModalStore } from "@/lib/stores/loginModalStore";

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
      <nav className="bg-white dark:bg-gray-800 shadow-sm border-b border-gray-200 dark:border-gray-700">
        <div className="max-w-7xl mx-auto px-4 640:px-6 1024:px-8">
          <div className="flex justify-between h-16">
            <div className="flex items-center">
              <Link
                href="/"
                className="text-xl font-semibold text-gray-900 dark:text-white"
              >
                Home
              </Link>
            </div>
            <div className="flex items-center space-x-4">
              {/* Empty during SSR to prevent hydration mismatch */}
            </div>
          </div>
        </div>
      </nav>
    );
  }
  return (
    <>
      <nav>
        <div className="hidden 1024:block">
          <DesktopNavbar />
        </div>
        <div className="1024:hidden">
          <MobileNavbar />
        </div>
      </nav>
      <SubNav />
    </>
  );
}
