"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { ArrowRight, Building2, Search, X } from "lucide-react";
import {
  fetchLocationMenu,
  type LocationMenuResponse,
} from "@/features/Navigation/lib/fetchLocationMenu";
import CountryFlag from "@/components/shared/ui/CountryFlag";

interface MenuModalProps {
  isOpen: boolean;
  onClose: () => void;
  /**
   * Menu rendered on the server and shipped with the page. When present the
   * modal opens with no request at all; null falls back to fetching on open.
   */
  initialLocationMenu?: LocationMenuResponse | null;
}

export default function MenuModal({
  isOpen,
  onClose,
  initialLocationMenu = null,
}: MenuModalProps) {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const locationMenuQuery = useQuery({
    queryKey: ["public-location-menu"],
    queryFn: fetchLocationMenu,
    enabled: isOpen,
    staleTime: 5 * 60 * 1000,
    initialData: initialLocationMenu ?? undefined,
  });
  const countries = locationMenuQuery.data?.countries ?? [];

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

        @keyframes menuItemRise {
          from {
            transform: translateY(10px);
            opacity: 0;
          }
          to {
            transform: translateY(0);
            opacity: 1;
          }
        }

        .menu-sheet-enter {
          animation: menuSlideIn 0.25s ease-out forwards;
        }

        .menu-reveal > * {
          animation: menuItemRise 0.42s ease-out both;
        }

        .menu-reveal > *:nth-child(2) {
          animation-delay: 60ms;
        }

        .menu-reveal > *:nth-child(3) {
          animation-delay: 120ms;
        }

        .menu-reveal > *:nth-child(4) {
          animation-delay: 180ms;
        }

        @media (min-width: 1024px) {
          .menu-sheet-enter {
            animation: menuSlideDown 0.35s ease-out forwards;
          }
        }

        @media (prefers-reduced-motion: reduce) {
          .menu-sheet-enter,
          .menu-overlay-enter,
          .menu-reveal > * {
            animation: none;
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
          className="menu-overlay-enter absolute inset-0 bg-black/60"
          onClick={onClose}
        />

        <aside className="menu-sheet-enter relative flex h-full w-[88%] max-w-[390px] flex-col overflow-hidden border-r border-white/15 bg-[#141414] text-white shadow-2xl 1024:h-auto 1024:max-h-[min(760px,calc(100vh-20px))] 1024:w-full 1024:max-w-none 1024:border-b 1024:border-r-0">
          <div className="flex shrink-0 items-center justify-between border-b border-white/10 px-5 py-4 1024:px-10 1024:py-5">
            <div>
              <p className="text-[10px] font-bold uppercase tracking-[0.24em] text-white/40">
                Questura
              </p>
              <h2 className="mt-1 font-display text-[1.35rem] leading-none tracking-[0.02em] 1024:text-[1.75rem]">
                Menu
              </h2>
            </div>
            <button
              onClick={onClose}
              className="rounded-full border border-white/10 p-2 transition-colors hover:bg-white/10 focus:outline-none focus-visible:ring-2 focus-visible:ring-white/45"
              aria-label="Close modal"
            >
              <X className="h-5 w-5 text-white" />
            </button>
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto px-5 py-5 1024:px-10 1024:py-7">
            <form onSubmit={submitSearch} className="mb-6 1024:mb-8 1024:max-w-[520px]">
              <div className="flex items-center gap-2.5 border-b border-white/25 py-3 transition-colors focus-within:border-white/70">
                <Search className="h-4 w-4 shrink-0 text-white/55" strokeWidth={1.5} aria-hidden />
                <input
                  type="search"
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  placeholder="Search articles, guides, maps, and itineraries..."
                  className="w-full bg-transparent text-sm font-semibold text-white outline-none placeholder:text-white/45"
                  autoComplete="off"
                  aria-label="Search articles"
                />
              </div>
            </form>

            <nav className="menu-reveal grid gap-8 1024:grid-cols-3 1024:gap-0" aria-label="Locations">
              {locationMenuQuery.isPending ? (
                <p className="text-sm font-semibold text-white/55">Loading locations...</p>
              ) : locationMenuQuery.isError ? (
                <p className="text-sm font-semibold text-white/55">Locations unavailable</p>
              ) : countries.length === 0 ? (
                <p className="text-sm font-semibold text-white/55">No locations yet</p>
              ) : (
                countries.map((country, index) => (
                  <section
                    key={country.locationKey}
                    className={`border-t border-white/10 pt-7 first:border-t-0 first:pt-0 1024:border-t-0 1024:pt-0 ${
                      index % 3 === 0
                        ? "1024:pr-9"
                        : index % 3 === 1
                          ? "1024:border-l 1024:border-r 1024:px-9"
                          : "1024:pl-9"
                    } ${index > 2 ? "1024:mt-10 1024:border-t 1024:pt-8" : ""}`}
                  >
                    <Link
                      href={country.href}
                      onClick={onClose}
                      className="group inline-flex items-center gap-2.5 font-display text-[1.75rem] font-semibold leading-none text-white transition-colors hover:text-white/78 focus:outline-none focus-visible:text-white/78 1024:text-[2rem]"
                    >
                      <CountryFlag
                        code={country.countryCode}
                        className="h-[1.05rem] w-[1.575rem] shadow-[0_0_0_1px_rgba(255,255,255,0.22)] 1024:h-[1.2rem] 1024:w-[1.8rem]"
                      />
                      {country.label}
                      <ArrowRight className="mt-1 h-5 w-5 transition-transform group-hover:translate-x-1" aria-hidden />
                    </Link>

                    <div className="mt-7 space-y-4">
                      {country.cities.length > 0 ? (
                        country.cities.map((city) => (
                          <Link
                            key={city.locationKey}
                            href={city.href}
                            onClick={onClose}
                            className="flex items-center gap-2.5 text-[1.05rem] font-bold text-white/88 transition-colors hover:text-white focus:outline-none focus-visible:text-white"
                          >
                            <Building2 className="h-4 w-4 shrink-0" strokeWidth={1.5} aria-hidden />
                            {city.label}
                          </Link>
                        ))
                      ) : (
                        <Link
                          href={country.href}
                          onClick={onClose}
                          className="flex items-center gap-2.5 text-[1.05rem] font-bold text-white/88 transition-colors hover:text-white focus:outline-none focus-visible:text-white"
                        >
                          <Building2 className="h-4 w-4 shrink-0" strokeWidth={1.5} aria-hidden />
                          View all {country.label} guides
                        </Link>
                      )}
                    </div>
                  </section>
                ))
              )}
            </nav>
          </div>
        </aside>
      </div>
    </>
  );
}
