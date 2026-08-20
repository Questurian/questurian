export const BOOKMARK_TARGET_TYPES = ['articles', 'maps', 'itineraries'] as const;

export type BookmarkTargetType = (typeof BOOKMARK_TARGET_TYPES)[number];

export type BookmarkRef = {
  targetType: BookmarkTargetType;
  targetId: number;
};

export type BookmarkListItem = {
  id: number | string;
  title: string;
  slug: string;
  excerpt: string | null;
  publishedAt: string | null;
  href: string;
  thumbnail: { url: string; alt: string | null } | null;
  targetType: BookmarkTargetType;
  /** `member` means the reader needs a membership to read past the free sample. */
  access: 'free' | 'member';
  bookmarkedAt: string;
};

export type BookmarkListPage = {
  page: number;
  pageSize: number;
  totalDocs: number;
  totalPages: number;
  hasNext: boolean;
  hasPrev: boolean;
  items: BookmarkListItem[];
};

export const BOOKMARK_TYPE_LABEL: Record<BookmarkTargetType, string> = {
  articles: 'Articles',
  maps: 'Maps',
  itineraries: 'Itineraries',
};

export function bookmarkRefKey(ref: BookmarkRef): string {
  return `${ref.targetType}:${ref.targetId}`;
}
