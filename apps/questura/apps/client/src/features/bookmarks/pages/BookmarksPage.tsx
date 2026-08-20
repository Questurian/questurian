'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect } from 'react';
import { Bookmark as BookmarkIcon, Lock } from 'lucide-react';

import LoadingSpinner from '@/components/shared/ui/LoadingSpinner';
import { PublicImage } from '@/components/media/PublicImage';
import { useAuth } from '@/lib/user/hooks';
import { getPublicBaseUrl } from '@/lib/seo/publicBaseUrl';
import { ArticleShareButton } from '@/features/articles/components/ArticleShareButton';
import { BookmarkButton } from '../components/BookmarkButton';
import { useBookmarkPage } from '../hooks/useBookmarks';
import { useBookmarkStore } from '../stores/bookmarkStore';
import {
  BOOKMARK_TARGET_TYPES,
  BOOKMARK_TYPE_LABEL,
  type BookmarkListItem,
  type BookmarkTargetType,
} from '../types';

/*
  The saved list is a broadsheet index, not a card wall: rows separated by
  hairlines, headline left, thumbnail right, actions under the byline. Nothing
  here is a rounded, floating tile -- a reader's own archive should read like
  the paper it was cut out of.
*/

const tabClass =
  'relative -mb-px border-b-2 px-1 pb-3 font-display text-[11px] uppercase tracking-[0.18em] transition-colors';

function formatSavedDate(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });
}

function BookmarkRow({ item }: { item: BookmarkListItem }) {
  const { user } = useAuth();
  const locked = item.access === 'member' && !user?.membership?.active;
  const savedDate = formatSavedDate(item.bookmarkedAt);

  return (
    <li className="border-t border-foreground/12 py-7 first:border-t-0 first:pt-0 768:py-9">
      <div className="flex items-start gap-5 768:gap-10">
        <div className="min-w-0 flex-1">
          <p className="font-display text-[11px] uppercase tracking-[0.16em] text-foreground/55">
            {savedDate}
            <span className="px-2 text-foreground/30" aria-hidden>
              •
            </span>
            {BOOKMARK_TYPE_LABEL[item.targetType]}
          </p>

          <Link href={item.href} className="group/title mt-2 block">
            <h2 className="font-display text-[20px] font-bold leading-[1.2] text-foreground group-hover/title:text-accent 768:text-[26px]">
              {item.title}
            </h2>
          </Link>

          {item.excerpt ? (
            <p data-article-dek className="mt-2 line-clamp-2 text-[14px] leading-snug text-foreground/65 768:text-[15px]">
              <Link href={item.href}>{item.excerpt}</Link>
            </p>
          ) : null}

          <div className="mt-4 flex items-center gap-5">
            <BookmarkButton
              targetType={item.targetType}
              targetId={Number(item.id)}
              variant="icon"
            />
            <ArticleShareButton
              title={item.title}
              imageUrl={item.thumbnail?.url ?? null}
              url={`${getPublicBaseUrl()}${item.href}`}
              variant="icon"
            />

            {/*
              A members-only item the reader cannot yet read stays in the list
              and says so. It is the one place in the product where we know
              exactly which paid article someone wanted, so it is an offer
              rather than a dead end.
            */}
            {locked ? (
              <Link
                href="/purchase/monthly"
                className="inline-flex items-center gap-1.5 font-display text-[11px] uppercase tracking-[0.16em] text-accent hover:opacity-70"
              >
                <Lock className="size-3.5" strokeWidth={1.75} aria-hidden />
                Members only — unlock
              </Link>
            ) : null}
          </div>
        </div>

        {item.thumbnail ? (
          <Link
            href={item.href}
            className="block w-[112px] shrink-0 480:w-[150px] 768:w-[260px]"
            tabIndex={-1}
            aria-hidden
          >
            <div className="relative aspect-[3/2] w-full overflow-hidden bg-foreground/5">
              <PublicImage
                src={item.thumbnail.url}
                alt={item.thumbnail.alt ?? ''}
                width={600}
                height={400}
                sizes="(min-width: 768px) 260px, 150px"
                className="h-full w-full object-cover transition-opacity hover:opacity-90"
              />
            </div>
          </Link>
        ) : null}
      </div>
    </li>
  );
}

function EmptyState({ filtered }: { filtered: boolean }) {
  return (
    <div className="border-t border-foreground/12 px-2 py-16 text-center">
      <BookmarkIcon
        className="mx-auto mb-4 size-6 text-foreground/35"
        strokeWidth={1.5}
        aria-hidden
      />
      <p className="font-display text-[19px] font-bold text-foreground">
        {filtered ? 'Nothing saved here yet' : 'Nothing saved yet'}
      </p>
      <p className="mx-auto mt-2 max-w-[42ch] text-[15px] leading-snug text-foreground/65">
        {filtered
          ? 'Try another category, or bookmark something from this one.'
          : 'Tap Bookmark on any article, map or itinerary and it will be waiting here.'}
      </p>
      <Link
        href="/articles"
        className="mt-6 inline-block border-b border-accent pb-0.5 font-display text-[11px] uppercase tracking-[0.18em] text-accent hover:opacity-70"
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

  // Unbookmarking from this page should remove the row at once. The list is a
  // React Query snapshot and the control writes to the store, so the store is
  // what decides whether a fetched row is still held. Read above the auth
  // early returns: this component renders once while auth is still loading,
  // and a hook that only runs on the second render is a hook count change.
  const held = useBookmarkStore((state) => state.refs);
  const storeReady = useBookmarkStore((state) => state.status) === 'ready';

  useEffect(() => {
    if (!loading && !isAuthenticated) {
      router.push('/?showLogin=true&redirect=/account/bookmarks');
    }
  }, [loading, isAuthenticated, router]);

  if (loading) return <LoadingSpinner />;
  if (!isAuthenticated) return null;

  const items = (data?.items ?? []).filter(
    (item) => !storeReady || held.has(`${item.targetType}:${item.id}`)
  );

  const tabs: Array<{ value: BookmarkTargetType | null; label: string }> = [
    { value: null, label: 'All' },
    ...BOOKMARK_TARGET_TYPES.map((value) => ({ value, label: BOOKMARK_TYPE_LABEL[value] })),
  ];

  return (
    <div className="min-h-screen bg-background">
      <div className="mx-auto max-w-5xl px-4 pb-24 pt-8 480:px-6 768:pt-14">
        <header>
          <h1 className="font-display text-[30px] font-bold leading-[1.1] text-foreground 480:text-[38px] 768:text-[44px]">
            Bookmarks
          </h1>

          {/* Tabs sit on the rule that opens the list, so the filter and the
              content it filters are the same object. */}
          <nav className="mt-6 flex flex-wrap gap-x-7 border-b border-foreground/20 768:mt-8">
            {tabs.map((tab) => {
              const active = type === tab.value;
              return (
                <button
                  key={tab.label}
                  type="button"
                  aria-current={active ? 'page' : undefined}
                  onClick={() => {
                    setType(tab.value);
                    setPage(1);
                  }}
                  className={`${tabClass} ${
                    active
                      ? 'border-accent text-foreground'
                      : 'border-transparent text-foreground/55 hover:text-foreground'
                  }`}
                >
                  {tab.label}
                </button>
              );
            })}
          </nav>
        </header>

        <section className="pt-8 768:pt-10">
          {isLoading ? (
            <LoadingSpinner />
          ) : isError ? (
            <p className="text-[15px] text-foreground/70">
              We could not load your bookmarks. Please try again.
            </p>
          ) : items.length === 0 ? (
            <EmptyState filtered={type !== null} />
          ) : (
            <>
              <ul>
                {items.map((item) => (
                  <BookmarkRow key={`${item.targetType}:${item.id}`} item={item} />
                ))}
              </ul>

              {data && data.totalPages > 1 ? (
                <div className="mt-10 flex items-center justify-center gap-6 border-t border-foreground/12 pt-8">
                  <button
                    type="button"
                    disabled={!data.hasPrev}
                    onClick={() => setPage((current) => Math.max(1, current - 1))}
                    className="border border-foreground/25 px-4 py-2 font-display text-[11px] uppercase tracking-[0.18em] text-foreground transition-colors hover:border-foreground/50 disabled:opacity-30 disabled:hover:border-foreground/25"
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
                    className="border border-foreground/25 px-4 py-2 font-display text-[11px] uppercase tracking-[0.18em] text-foreground transition-colors hover:border-foreground/50 disabled:opacity-30 disabled:hover:border-foreground/25"
                  >
                    Next
                  </button>
                </div>
              ) : null}
            </>
          )}
        </section>
      </div>
    </div>
  );
}
