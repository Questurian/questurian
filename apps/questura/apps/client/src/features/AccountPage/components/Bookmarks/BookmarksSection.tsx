'use client';

import Link from 'next/link';
import { Bookmark, ChevronRight } from 'lucide-react';

import { useBookmarkCount } from '@/features/bookmarks/hooks/useBookmarks';

/**
 * Entry point to the Bookmark list from the account page.
 *
 * Shows the count because an empty list and a full one want different copy, and
 * because the number is the only thing here the reader cannot already guess.
 */
export function BookmarksSection() {
  const { count, isLoading } = useBookmarkCount();

  return (
    <Link
      href="/account/bookmarks"
      className="flex items-center justify-between gap-4 rounded-sm border border-[#d7d4ce] bg-[#f7f6f2] p-4 transition-colors hover:border-[#b9b5ac] 480:p-6 768:p-8"
    >
      <span className="flex items-center gap-3">
        <Bookmark className="size-5 text-foreground/70" strokeWidth={1.75} aria-hidden />
        <span>
          <span className="block font-display text-[16px] text-foreground">Bookmarks</span>
          <span className="block font-display text-[14px] text-foreground/60">
            {isLoading
              ? 'Loading…'
              : count === 0
                ? 'Nothing saved yet'
                : `${count} saved ${count === 1 ? 'item' : 'items'}`}
          </span>
        </span>
      </span>

      <ChevronRight className="size-5 shrink-0 text-foreground/40" strokeWidth={1.75} aria-hidden />
    </Link>
  );
}
