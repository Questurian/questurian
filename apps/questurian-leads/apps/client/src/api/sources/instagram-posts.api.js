import { request } from '../client';
import { withQuery } from '../utils/queryParams';

export const instagramPostsApi = {
  getAll: (params = {}) => request(withQuery('/instagram-feeds/posts', params)),
  getById: (id) => request(`/instagram-feeds/posts/${id}`),
  delete: (id) => request(`/instagram-feeds/posts/${id}`, { method: 'DELETE' }),
};
