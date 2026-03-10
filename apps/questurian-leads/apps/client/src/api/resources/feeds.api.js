import { request } from '../client';
import { withQuery } from '../utils/queryParams';

export const feedsApi = {
  getAll: (params = {}) => request(withQuery('/feeds', params)),
  getById: (id) => request(`/feeds/${id}`),
  getByCategory: (categoryId) => request(`/feeds/category/${categoryId}`),
  create: (data) => request('/feeds', { method: 'POST', body: JSON.stringify(data) }),
  update: (id, data) => request(`/feeds/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  activate: (id) => request(`/feeds/${id}/activate`, { method: 'PATCH' }),
  deactivate: (id) => request(`/feeds/${id}/deactivate`, { method: 'PATCH' }),
  delete: (id) => request(`/feeds/${id}`, { method: 'DELETE' }),
  fetch: (id) => request(`/feeds/${id}/fetch`, { method: 'POST' }),
  fetchAll: () => request('/feeds/fetch-all', { method: 'POST' }),
};
