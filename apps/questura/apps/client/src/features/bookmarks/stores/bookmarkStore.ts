import { create } from 'zustand';

import { createBookmark, deleteBookmark, fetchBookmarkRefs } from '../services/bookmarks.service';
import { bookmarkRefKey, type BookmarkRef } from '../types';

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
 * per page rather than once per card.
 */

type BookmarkStoreState = {
  refs: Set<string>;
  status: 'idle' | 'loading' | 'ready';
  pending: Set<string>;
  /**
   * Whether the reader has a session, as reported by the refs endpoint.
   *
   * An empty `refs` cannot answer this on its own: a signed-out reader and a
   * signed-in reader with nothing saved both have none. Knowing which is what
   * keeps a signed-out click from optimistically filling the control in and
   * then emptying it again when the write comes back 401.
   */
  authenticated: boolean;
};

type BookmarkStoreActions = {
  /** Fetch once per page. Safe to call from every mounted control. */
  ensureLoaded: () => Promise<void>;
  /** Replace local state, e.g. after a sign-in hands us a different reader. */
  reload: () => Promise<void>;
  isBookmarked: (ref: BookmarkRef) => boolean;
  isPending: (ref: BookmarkRef) => boolean;
  /**
   * Returns `'unauthenticated'` when the write was refused for want of a
   * session, so the caller can open the login modal and replay the intent. The
   * server is the only thing that actually knows, so this asks it rather than
   * probing auth state first.
   */
  toggle: (ref: BookmarkRef, next: boolean) => Promise<'ok' | 'unauthenticated' | 'error'>;
};

function isUnauthorized(error: unknown): boolean {
  const status = (error as { status?: number } | null)?.status;
  return status === 401 || status === 403;
}

export const useBookmarkStore = create<BookmarkStoreState & BookmarkStoreActions>((set, get) => ({
  refs: new Set<string>(),
  status: 'idle',
  pending: new Set<string>(),
  authenticated: false,

  ensureLoaded: async () => {
    if (get().status !== 'idle') return;
    set({ status: 'loading' });
    try {
      const { authenticated, refs } = await fetchBookmarkRefs();
      set({
        refs: new Set(refs.map(bookmarkRefKey)),
        authenticated,
        status: 'ready',
      });
    } catch {
      // A reader who is signed out, or offline, simply has nothing marked.
      // Failing loudly here would put an error on every article page.
      set({ status: 'ready' });
    }
  },

  reload: async () => {
    set({ status: 'idle' });
    await get().ensureLoaded();
  },

  isBookmarked: (ref) => get().refs.has(bookmarkRefKey(ref)),

  isPending: (ref) => get().pending.has(bookmarkRefKey(ref)),

  toggle: async (ref, next) => {
    const key = bookmarkRefKey(ref);

    // Signed out: say so before touching the icon. The optimistic update below
    // is right for a reader whose write will succeed and wrong for one whose
    // will not -- filling the control in and emptying it a moment later reads
    // as the bookmark being taken away.
    if (get().status === 'ready' && !get().authenticated) {
      return 'unauthenticated';
    }

    const previous = get().refs;

    const optimistic = new Set(previous);
    if (next) optimistic.add(key);
    else optimistic.delete(key);

    set((state) => ({ refs: optimistic, pending: new Set(state.pending).add(key) }));

    const clearPending = () =>
      set((state) => {
        const pending = new Set(state.pending);
        pending.delete(key);
        return { pending };
      });

    try {
      if (next) await createBookmark(ref);
      else await deleteBookmark(ref);
      clearPending();
      // A write proves the session in a way the cached flag cannot, so a reader
      // who signed in elsewhere since page load stops being treated as guest.
      if (!get().authenticated) set({ authenticated: true });
      return 'ok';
    } catch (error) {
      set({ refs: previous });
      clearPending();
      if (isUnauthorized(error)) {
        set({ authenticated: false });
        return 'unauthenticated';
      }
      return 'error';
    }
  },
}));
