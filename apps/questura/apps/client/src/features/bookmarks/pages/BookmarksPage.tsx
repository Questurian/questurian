'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect } from 'react';
import { Bookmark as BookmarkIcon, Lock } from 'lucide-react';

import LoadingSpinner from '@/components/shared/ui/LoadingSpinner';
import { PublicImage } from '@/components/media/PublicImage';
import { useAuth } from '@/lib/user/hooks';
import { BookmarkButton } from '../components/BookmarkButton';
import { useBookmarkPage } from '../hooks/useBookmarks';
import { useBookmarkStore } from '../stores/bookmarkStore';
import {
  BOOKMARK_TARGET_TYPES,
  BOOKMARK_TYPE_LABEL,
  type BookmarkListItem,
  type BookmarkTargetType,
} from '../types';

const filterClass =
  'rounded-full border px-3 py-1.5 font-display text-[11px] uppercase tracking-[0.18em] transition-colors';

function formatSavedDate(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });
}

function BookmarkCard({ item }: { item: BookmarkListItem }) {
  const { user } = useAuth();
  const locked = item.access === 'member' && !user?.membership?.active;

  return (
    <li className="group">
      <div className="relative">
        {item.thumbnail ? (
          <Link href={item.href} className="block">
            <div className="relative mb-4 aspect-[4/3] w-full overflow-hidden rounded-lg bg-foreground/5">
              <PublicImage
                src={item.thumbnail.url}
                alt={item.thumbnail.alt ?? ''}
                width={600}
                height={450}
                sizes="(min-width: 1024px) 33vw, (min-width: 768px) 50vw, 100vw"
                className="h-full w-full object-cover transition group-hover:scale-105"
              />
            </div>
          </Link>
        ) : null}

        <div className="absolute right-2 top-2 z-10">
          <BookmarkButton targetType={item.targetType} targetId={Number(item.id)} variant="card" />
        </div>
      </div>

      <p className="mb-2 font-display text-[10px] uppercase tracking-[0.24em] text-foreground/50">
        {BOOKMARK_TYPE_LABEL[item.targetType]} · Saved {formatSavedDate(item.bookmarkedAt)}
      </p>

      <Link href={item.href} className="block">
        <h2 className="font-display text-[22px] leading-[1.15] text-foreground group-hover:underline">
          {item.title}
        </h2>
      </Link>

      {item.excerpt ? (
        <p className="mt-2 font-display text-[15px] leading-snug text-foreground/70">
          {item.excerpt}
        </p>
      ) : null}

      {/*
        A members-only item the reader cannot yet read stays in the list and says
        so. It is the one place in the product where we know exactly which paid
        article someone wanted, so it is an offer rather than a dead end.
      */}
      {locked ? (
        <Link
          href="/purchase/monthly"
          className="mt-3 inline-flex items-center gap-1.5 font-display text-[11px] uppercase tracking-[0.18em] text-accent hover:opacity-70"
        >
          <Lock className="size-3.5" strokeWidth={1.75} aria-hidden />
          Members only — unlock
        </Link>
      ) : null}
    </li>
  );
}

function EmptyState({ filtered }: { filtered: boolean }) {
  return (
    <div className="rounded-lg border border-foreground/12 bg-paper px-6 py-12 text-center">
      <BookmarkIcon
        className="mx-auto mb-4 size-7 text-foreground/40"
        strokeWidth={1.5}
        aria-hidden
      />
      <p className="font-display text-[18px] text-foreground">
        {filtered ? 'Nothing bookmarked here yet' : 'No bookmarks yet'}
      </p>
      <p className="mx-auto mt-2 max-w-[38ch] font-display text-[15px] leading-snug text-foreground/65">
        {filtered
          ? 'Try another category, or bookmark something from this one.'
          : 'Tap Bookmark on any article, map or itinerary and it will be waiting here.'}
      </p>
      <Link
        href="/articles"
        className="mt-5 inline-block font-display text-[11px] uppercase tracking-[0.18em] text-accent hover:opacity-70"
      >
        Browse articles
      </Link>
    </div>
  );
}

export function BookmarksPage() {
  const router = useRouter();
  const { loading, isAuthenticated } = useAuth();
  const [type, setType] = useState<BookmarkTargetType | null>(null);
  const [page, setPage] = useState(1);

  const { data, isLoading, isError } = useBookmarkPage(page, type);

  useEffect(() => {
    if (!loading && !isAuthenticated) {
      router.push('/?showLogin=true&redirect=/account/bookmarks');
    }
  }, [loading, isAuthenticated, router]);

  if (loading) return <LoadingSpinner />;
  if (!isAuthenticated) return null;

  // Unbookmarking from this page should remove the card at once. The list is a
  // React Query snapshot and the control writes to the store, so the store is
  // what decides whether a fetched card is still held.
  const held = useBookmarkStore((state) => state.refs);
  const storeReady = useBookmarkStore((state) => state.status) === 'ready';
  const items = (data?.items ?? []).filter(
    (item) => !storeReady || held.has(`${item.targetType}:${item.id}`)
  );

  return (
    <div className="min-h-screen bg-background">
      <header className="px-4 pt-8 480:px-6 480:pt-12 768:pt-14">
        <div className="mx-auto max-w-6xl">
          <h1 className="font-display text-[32px] leading-[1.1] text-foreground 480:text-[42px] 768:text-[52px]">
            Bookmarks
          </h1>

          <div className="mt-6 flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => {
                setType(null);
                setPage(1);
              }}
              className={`${filterClass} ${
                type === null
                  ? 'border-accent bg-accent text-white'
                  : 'border-foreground/20 text-foreground hover:border-foreground/40'
              }`}
            >
              All
            </button>
            {BOOKMARK_TARGET_TYPES.map((value) => (
              <button
                key={value}
                type="button"
                onClick={() => {
                  setType(value);
                  setPage(1);
                }}
                className={`${filterClass} ${
                  type === value
                    ? 'border-accent bg-accent text-white'
                    : 'border-foreground/20 text-foreground hover:border-foreground/40'
                }`}
              >
                {BOOKMARK_TYPE_LABEL[value]}
              </button>
            ))}
          </div>
        </div>
      </header>

      <section className="px-4 pb-20 pt-8 480:px-6 768:pt-10">
        <div className="mx-auto max-w-6xl">
          {isLoading ? (
            <LoadingSpinner />
          ) : isError ? (
            <p className="font-display text-[15px] text-foreground/70">
              We could not load your bookmarks. Please try again.
            </p>
          ) : items.length === 0 ? (
            <EmptyState filtered={type !== null} />
          ) : (
            <>
              <ul className="grid gap-10 768:grid-cols-2 1024:grid-cols-3">
                {items.map((item) => (
                  <BookmarkCard key={`${item.targetType}:${item.id}`} item={item} />
                ))}
              </ul>

              {data && data.totalPages > 1 ? (
                <div className="mt-12 flex items-center justify-center gap-4">
                  <button
                    type="button"
                    disabled={!data.hasPrev}
                    onClick={() => setPage((current) => Math.max(1, current - 1))}
                    className="font-display text-[11px] uppercase tracking-[0.18em] text-foreground disabled:opacity-30"
                  >
                    Previous
                  </button>
                  <span className="font-display text-[13px] text-foreground/60">
                    {data.page} / {data.totalPages}
                  </span>
                  <button
                    type="button"
                    disabled={!data.hasNext}
                    onClick={() => setPage((current) => current + 1)}
                    className="font-display text-[11px] uppercase tracking-[0.18em] text-foreground disabled:opacity-30"
                  >
                    Next
                  </button>
                </div>
              ) : null}
            </>
          )}
        </div>
      </section>
    </div>
  );
}
