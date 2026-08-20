'use client';

import type { JSX } from 'react';
import { Bookmark } from 'lucide-react';

import { useBookmark } from '../hooks/useBookmarks';
import type { BookmarkTargetType } from '../types';

type Variant = 'inline' | 'card';

type BookmarkButtonProps = {
  targetType: BookmarkTargetType;
  targetId: number;
  /** `inline` sits in the article's byline rule beside Share; `card` overlays a thumbnail. */
  variant?: Variant;
  className?: string;
};

const inlineClass =
  'inline-flex items-center gap-1.5 font-display text-[10px] uppercase leading-none tracking-[0.18em] transition-opacity hover:opacity-70 active:opacity-100 380:text-[11px]';

const cardClass =
  'inline-flex size-8 items-center justify-center rounded-full bg-paper/90 backdrop-blur-[2px] transition-colors hover:bg-paper';

/**
 * The bookmark control (ADR-0010).
 *
 * Rendered for everyone, signed in or not, because the click is the cheapest
 * reason a reader ever has to make an account — hiding it until they have one
 * spends that reason to save a modal.
 *
 * This is a client island by necessity, not preference. Public content pages
 * are cached and anonymous-first under ADR-0003; the page HTML cannot know who
 * is reading it, so the saved state fills in after hydration. Until it does the
 * control renders unsaved rather than blank, so the byline rule does not reflow
 * under the reader.
 */
export function BookmarkButton({
  targetType,
  targetId,
  variant = 'inline',
  className,
}: BookmarkButtonProps): JSX.Element {
  const { isBookmarked, isPending, toggle } = useBookmark({ targetType, targetId });

  // Saved state is the same bookmark glyph filled in, not a different glyph.
  // A check mark reports that an action succeeded; a solid bookmark shows the
  // thing is held -- which is the state the control is actually communicating,
  // and it stays legible at the 16px the card variant renders at.
  const label = isBookmarked ? 'Bookmarked' : 'Bookmark';

  const handleClick = (event: React.MouseEvent) => {
    // Card variants sit inside a link to the article.
    event.preventDefault();
    event.stopPropagation();
    void toggle();
  };

  if (variant === 'card') {
    return (
      <button
        type="button"
        onClick={handleClick}
        disabled={isPending}
        aria-pressed={isBookmarked}
        aria-label={label}
        title={label}
        className={[cardClass, isBookmarked ? 'text-accent' : 'text-foreground', className]
          .filter(Boolean)
          .join(' ')}
      >
        <Bookmark
          className="size-4"
          strokeWidth={1.75}
          fill={isBookmarked ? 'currentColor' : 'none'}
          aria-hidden
        />
      </button>
    );
  }

  return (
    <button
      type="button"
      onClick={handleClick}
      disabled={isPending}
      aria-pressed={isBookmarked}
      className={[inlineClass, isBookmarked ? 'text-accent' : 'text-foreground', className]
        .filter(Boolean)
        .join(' ')}
    >
      <Bookmark
        className="size-4"
        strokeWidth={1.75}
        fill={isBookmarked ? 'currentColor' : 'none'}
        aria-hidden
      />
      <span>{label}</span>
    </button>
  );
}
