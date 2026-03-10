import { API_BASE } from './client';

export function instagramPostImageUrl(postId) {
  return `${API_BASE}/instagram-feeds/posts/${postId}/image`;
}
