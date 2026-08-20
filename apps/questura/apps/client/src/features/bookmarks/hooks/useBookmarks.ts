'use client';

import { useCallback, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';

import { APIError } from '@/lib/api';
import { queryKeys } from '@/lib/react-query';
import { useLoginModalStore } from '@/lib/stores/loginModalStore';
import { fetchBookmarkPage } from '../services/bookmarks.service';
import { useBookmarkStore } from '../stores/bookmarkStore';
import type { BookmarkRef, BookmarkTargetType } from '../types';

/**
 * Bookmark state for one control.
 *
 * Store-backed rather than React Query, because the public shell mounts no
 * QueryClient around page content (see `stores/bookmarkStore.ts`).
 */
export function useBookmark(ref: BookmarkRef) {
  const ensureLoaded = useBookmarkStore((state) => state.ensureLoaded);
  const reload = useBookmarkStore((state) => state.reload);
  const toggleInStore = useBookmarkStore((state) => state.toggle);
  const openLoginModal = useLoginModalStore((state) => state.openLoginModal);

  const isBookmarked = useBookmarkStore((state) => state.refs.has(`${ref.targetType}:${ref.targetId}`));
  const isPending = useBookmarkStore((state) => state.pending.has(`${ref.targetType}:${ref.targetId}`));

  useEffect(() => {
    void ensureLoaded();
  }, [ensureLoaded]);

  const toggle = useCallback(async () => {
    const next = !isBookmarked;
    const result = await toggleInStore(ref, next);

    if (result === 'unauthenticated') {
      openLoginModal({
        title: 'Save this for later',
        subtitle: 'Sign in and we will add it to your bookmarks.',
        onSuccess: () => {
          // Replay the click that opened the modal. Adding is the only sensible
          // replay: nobody signs in to remove a bookmark they could not have
          // had while signed out.
          void reload().then(() => toggleInStore(ref, true));
        },
      });
    }
  }, [isBookmarked, openLoginModal, ref, reload, toggleInStore]);

  return { isBookmarked, isPending, toggle };
}

/**
 * The Bookmark list page, which lives under `app/(private)` where
 * `ClientInteractionProvider` does wrap page content, so React Query is
 * available here.
 */
export function useBookmarkPage(page: number, type: BookmarkTargetType | null) {
  return useQuery({
    queryKey: queryKeys.bookmarkPage(page, type),
    queryFn: () => fetchBookmarkPage({ page, pageSize: 20, type: type ?? undefined }),
    retry: (failureCount, error) => {
      if (error instanceof APIError && error.status >= 400 && error.status < 500) return false;
      return failureCount < 2;
    },
    staleTime: 30 * 1000,
  });
}

/** Count of everything the reader has bookmarked, for the account-page entry point. */
export function useBookmarkCount() {
  const ensureLoaded = useBookmarkStore((state) => state.ensureLoaded);
  const count = useBookmarkStore((state) => state.refs.size);
  const status = useBookmarkStore((state) => state.status);

  useEffect(() => {
    void ensureLoaded();
  }, [ensureLoaded]);

  return { count, isLoading: status !== 'ready' };
}
