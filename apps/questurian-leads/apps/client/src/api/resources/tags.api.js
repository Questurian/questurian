import { request } from '../client';

export const tagsApi = {
  getAll: () => request('/tags'),
  getById: (id) => request(`/tags/${id}`),
  create: (data) => request('/tags', { method: 'POST', body: JSON.stringify(data) }),
  update: (id, data) => request(`/tags/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  delete: (id) => request(`/tags/${id}`, { method: 'DELETE' }),
  getFeedTags: (feedId) => request(`/tags/feeds/${feedId}/tags`),
  addToFeed: (feedId, tagId) =>
    request(`/tags/feeds/${feedId}/tags/${tagId}`, { method: 'POST' }),
  removeFromFeed: (feedId, tagId) =>
    request(`/tags/feeds/${feedId}/tags/${tagId}`, { method: 'DELETE' }),
  updateFeedTags: (feedId, tags) =>
    request(`/tags/feeds/${feedId}/tags`, {
      method: 'PUT',
      body: JSON.stringify({ tags }),
    }),
};
