import { del, get, post } from '@/lib/api';
import type { BookmarkListPage, BookmarkRef, BookmarkTargetType } from '../types';

export async function fetchBookmarkRefs(): Promise<{
  authenticated: boolean;
  refs: BookmarkRef[];
}> {
  const response = await get<{ authenticated?: boolean; refs?: BookmarkRef[] }>(
    '/api/account/bookmarks/refs'
  );
  return { authenticated: response.authenticated ?? false, refs: response.refs ?? [] };
}

export async function fetchBookmarkPage(options: {
  page: number;
  pageSize: number;
  type?: BookmarkTargetType;
}): Promise<BookmarkListPage> {
  const params = new URLSearchParams({
    page: String(options.page),
    pageSize: String(options.pageSize),
  });
  if (options.type) params.set('type', options.type);

  return get<BookmarkListPage>(`/api/account/bookmarks?${params.toString()}`);
}

export async function createBookmark(ref: BookmarkRef): Promise<void> {
  await post('/api/account/bookmarks', { ...ref });
}

export async function deleteBookmark(ref: BookmarkRef): Promise<void> {
  const params = new URLSearchParams({
    targetType: ref.targetType,
    targetId: String(ref.targetId),
  });
  await del(`/api/account/bookmarks?${params.toString()}`);
}
