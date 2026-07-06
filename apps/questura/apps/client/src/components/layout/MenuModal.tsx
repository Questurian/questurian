"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { Search, X } from "lucide-react";
import { useAuth } from "@/lib/user/hooks";
import { useLoginModalStore } from "@/lib/stores/loginModalStore";
import { useMembership } from "@/features/Payments/hooks/useMembership";
import { fetchLocationMenu } from "@/features/Navigation/lib/fetchLocationMenu";

interface MenuModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export default function MenuModal({ isOpen, onClose }: MenuModalProps) {
  const { user, isAuthenticated } = useAuth();
  const { isActive } = useMembership(user);
  const openLoginModal = useLoginModalStore((state) => state.openLoginModal);
  const router = useRouter();
  const [query, setQuery] = useState("");
  const shouldShowMembership = !isAuthenticated || !isActive;
  const locationMenuQuery = useQuery({
    queryKey: ["public-location-menu"],
    queryFn: fetchLocationMenu,
    enabled: isOpen,
    staleTime: 5 * 60 * 1000,
  });

  // The modal stays mounted while closed, so reset the field whenever it
  // closes — leftover text would otherwise reappear on the next open.
  useEffect(() => {
    if (!isOpen) setQuery("");
  }, [isOpen]);

  const submitSearch = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const trimmed = query.trim();
    if (!trimmed) return;
    onClose();
    setQuery("");
    router.push(`/search?q=${encodeURIComponent(trimmed)}`);
  };

  if (!isOpen) return null;

  return (
    <>
      <style>{`
        @keyframes menuSlideIn {
          from {
            transform: translateX(-18px);
            opacity: 0.65;
          }
          to {
            transform: translateX(0px);
            opacity: 1;
          }
        }

        @keyframes menuSlideDown {
          from {
            transform: translateY(-100%);
          }
          to {
            transform: translateY(0);
          }
        }

        @keyframes menuFadeIn {
          from {
            opacity: 0;
          }
          to {
            opacity: 1;
          }
        }

        .menu-sheet-enter {
          animation: menuSlideIn 0.25s ease-out forwards;
        }

        @media (min-width: 1024px) {
          .menu-sheet-enter {
            animation: menuSlideDown 0.35s ease-out forwards;
          }
        }

        .menu-overlay-enter {
          animation: menuFadeIn 0.2s ease-out forwards;
        }
      `}</style>

      <div className="fixed inset-0 z-50">
        <button
          type="button"
          aria-label="Close menu"
          className="menu-overlay-enter absolute inset-0 bg-black/40"
          onClick={onClose}
        />

        <aside className="menu-sheet-enter relative flex h-full w-[84%] max-w-[360px] flex-col border-r border-white/15 bg-[#1f1f1f] px-5 py-6 text-white shadow-2xl 1024:w-full 1024:max-w-none 1024:border-r-0">
          <div className="mb-7 flex shrink-0 items-center justify-between">
            <h2 className="font-display text-[1.15rem] tracking-[0.08em] uppercase">
              Menu
            </h2>
            <button
              onClick={onClose}
              className="rounded-full p-1.5 transition-colors hover:bg-white/10 focus:outline-none"
              aria-label="Close modal"
            >
              <X className="h-5 w-5 text-white" />
            </button>
          </div>

          <form onSubmit={submitSearch} className="mb-5 shrink-0">
            <div className="flex items-center gap-2.5 rounded-xl border border-white/10 px-3.5 py-3 transition-colors focus-within:border-white/30">
              <Search className="h-4 w-4 shrink-0 text-white/50" strokeWidth={1.5} aria-hidden />
              <input
                type="search"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Search articles, guides, maps, and itineraries…"
                className="w-full bg-transparent text-sm text-white outline-none placeholder:text-white/40"
                autoComplete="off"
                aria-label="Search articles"
              />
            </div>
          </form>

          <nav className="min-h-0 flex-1 overflow-y-auto pr-1" aria-label="Locations">
            <p className="mb-2 text-[11px] font-semibold uppercase tracking-[0.16em] text-white/42">
              Locations
            </p>

            {locationMenuQuery.isPending ? (
              <p className="rounded-xl border border-white/10 px-3.5 py-3 text-sm text-white/55">
                Loading locations...
              </p>
            ) : locationMenuQuery.isError ? (
              <p className="rounded-xl border border-white/10 px-3.5 py-3 text-sm text-white/55">
                Locations unavailable
              </p>
            ) : locationMenuQuery.data.countries.length === 0 ? (
              <p className="rounded-xl border border-white/10 px-3.5 py-3 text-sm text-white/55">
                No locations yet
              </p>
            ) : (
              <div className="space-y-5">
                {locationMenuQuery.data.countries.map((country) => (
                  <div key={country.locationKey}>
                    <Link
                      href={country.href}
                      onClick={onClose}
                      className="block rounded-xl border border-white/10 px-3.5 py-3 font-display text-[23px] leading-none text-white transition-colors hover:bg-white/10 focus:outline-none focus-visible:bg-white/10"
                    >
                      {country.label}
                    </Link>

                    {country.cities.length > 0 ? (
                      <div className="mt-2 space-y-1.5 pl-3">
                        {country.cities.map((city) => (
                          <Link
                            key={city.locationKey}
                            href={city.href}
                            onClick={onClose}
                            className="block rounded-lg px-3 py-2 text-sm font-medium text-white/72 transition-colors hover:bg-white/10 hover:text-white focus:outline-none focus-visible:bg-white/10 focus-visible:text-white"
                          >
                            {city.label}
                          </Link>
                        ))}
                      </div>
                    ) : null}
                  </div>
                ))}
              </div>
            )}
          </nav>

          <div className="mt-6 shrink-0 space-y-2 border-t border-white/10 pt-4">
            {shouldShowMembership ? (
              <Link
                href="/join"
                onClick={onClose}
                className="block rounded-xl border border-white/10 px-3.5 py-3 text-sm font-semibold transition-colors hover:bg-white/10"
              >
                Join Membership
              </Link>
            ) : null}

            {!isAuthenticated ? (
              <button
                type="button"
                onClick={() => {
                  onClose();
                  openLoginModal();
                }}
                className="block w-full rounded-xl border border-white/10 px-3.5 py-3 text-left text-sm font-semibold transition-colors hover:bg-white/10"
              >
                Sign In
              </button>
            ) : null}
          </div>
        </aside>
      </div>
    </>
  );
}
