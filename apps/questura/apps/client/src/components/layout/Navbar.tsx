"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useAuth, useLogoutMutation } from '@/lib/user/hooks';
import { useLoginModalStore } from '@/lib/stores/loginModalStore';
import LoadingSpinner from '@/components/shared/ui/LoadingSpinner';

export default function Navbar() {
  const { user, loading, isAuthenticated } = useAuth();
  const logoutMutation = useLogoutMutation();
  const openLoginModal = useLoginModalStore((state) => state.openLoginModal);

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
              <Link href="/" className="text-xl font-semibold text-gray-900 dark:text-white">
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
    <nav className="bg-white dark:bg-gray-800 shadow-sm border-b border-gray-200 dark:border-gray-700">
      <div className="max-w-7xl mx-auto px-4 640:px-6 1024:px-8">
        <div className="flex justify-between h-16">
          <div className="flex items-center">
            <Link href="/" className="text-xl font-semibold text-gray-900 dark:text-white">
              Home
            </Link>
          </div>
          <div className="flex items-center space-x-4">
            {loading ? (
              // Fallback UI during loading: show a small inline spinner
              <LoadingSpinner variant="inline" size="small" />
            ) : (
              // Main auth UI after loading completes
              <>
                {!isAuthenticated || user?.subscriptionStatus !== "active" ? (
                  <Link
                    href="/join"
                    className="text-gray-700 dark:text-gray-300 hover:text-gray-900 dark:hover:text-white transition-colors"
                  >
                    Join Membership
                  </Link>
                ) : null}

                {isAuthenticated ? (
                  <>
                    <Link
                      href="/account"
                      className="text-sm text-gray-600 dark:text-gray-400 hover:underline"
                    >
                      {user?.email?.split('@')[0]}
                    </Link>

                    <button
                      onClick={() => logoutMutation.mutate()}
                      className="bg-red-600 hover:bg-red-700 text-white px-3 py-1.5 rounded-md text-sm transition-colors cursor-pointer"
                    >
                      Sign Out
                    </button>
                  </>
                ) : (
                  <button
                    onClick={() => openLoginModal()}
                    className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-md text-sm transition-colors cursor-pointer"
                  >
                    Sign In
                  </button>
                )}
              </>
            )}
          </div>
        </div>
      </div>
    </nav>
  );
}