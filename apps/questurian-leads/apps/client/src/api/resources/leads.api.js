import { request } from '../client';
import { withQuery } from '../utils/queryParams';

export const leadsApi = {
  getAll: (params = {}) => request(withQuery('/leads', params)),
  getById: (id) => request(`/leads/${id}`),
  getByFeed: (feedId, params = {}) => request(withQuery(`/leads/feed/${feedId}`, params)),
  getByTag: (tagName, params = {}) => request(withQuery(`/leads/tag/${tagName}`, params)),
  getByCategory: (categoryName, params = {}) =>
    request(withQuery(`/leads/category/${categoryName}`, params)),
  create: (data) => request('/leads', { method: 'POST', body: JSON.stringify(data) }),
  update: (id, data) => request(`/leads/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  delete: (id) => request(`/leads/${id}`, { method: 'DELETE' }),
};
