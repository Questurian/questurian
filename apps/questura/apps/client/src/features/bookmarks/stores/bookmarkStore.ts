import { useStore } from 'zustand';

import { isUnauthenticated } from '@/lib/api';
import { identityStore } from '@/lib/user/currentIdentity';

import { createBookmark, deleteBookmark, fetchBookmarkRefs } from '../services/bookmarks.service';
import { bookmarkRefKey, type BookmarkRef } from '../types';
import { createBookmarkStore, type BookmarkCoreState } from './bookmarkStoreCore';

/**
 * Bookmark state for the public site, held in a module-level store rather than
 * React Query.
 *
 * This is forced by ADR-0003 and is not a preference. `app/(public)/layout.tsx`
 * is `force-static`, and `PublicChrome` mounts `ClientInteractionProvider` —
 * which is where `QueryProvider` lives — around the Navbar *only*, leaving page
 * content outside it. A `useQuery` inside an article page therefore throws "No
 * QueryClient set". Zustand needs no provider, which is why the login and user
 * modals already use it.
 *
 * One store shared by every control on the page means the refs are fetched once
 * per page rather than once per card. The logic — unknown versus signed out,
 * stale responses, recovery — lives in `bookmarkStoreCore.ts`.
 */
export const bookmarkStore = createBookmarkStore<BookmarkRef>({
  keyOf: bookmarkRefKey,
  fetchRefs: fetchBookmarkRefs,
  create: createBookmark,
  remove: deleteBookmark,
  isUnauthorized: isUnauthenticated,
});

type State = BookmarkCoreState<BookmarkRef>;

export function useBookmarkStore<T>(selector: (state: State) => T): T {
  return useStore(bookmarkStore, selector);
}
useBookmarkStore.getState = bookmarkStore.getState;

// Sign-in and sign-out change whose bookmarks these are. Drop the previous
// reader's refs and pending writes, and re-read if any control is showing.
if (typeof window !== 'undefined') {
  identityStore.subscribe(() => {
    void bookmarkStore.getState().resetForNewReader();
  });
}
