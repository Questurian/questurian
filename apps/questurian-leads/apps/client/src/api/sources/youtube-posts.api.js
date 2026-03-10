import { API_BASE, request } from '../client';
import { withQuery } from '../utils/queryParams';

export const youtubePostsApi = {
  getAll: (params = {}) => request(withQuery('/youtube-feeds/posts', params)),
  getById: (id) => request(`/youtube-feeds/posts/${id}`),
  delete: (id) => request(`/youtube-feeds/posts/${id}`, { method: 'DELETE' }),
  getTranscript: (id) => request(`/youtube-feeds/posts/${id}/transcript`),
  extractTranscript: (id) =>
    request(`/youtube-feeds/posts/${id}/transcript`, { method: 'POST' }),
  downloadTranscriptUrl: (id) =>
    `${API_BASE}/youtube-feeds/posts/${id}/transcript/download`,
};
