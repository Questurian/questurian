import { request } from '../client';
import { withQuery } from '../utils/queryParams';

export const instagramFeedsApi = {
  getAll: (params = {}) => request(withQuery('/instagram-feeds', params)),
  getById: (id) => request(`/instagram-feeds/${id}`),
  create: (data) =>
    request('/instagram-feeds', { method: 'POST', body: JSON.stringify(data) }),
  update: (id, data) =>
    request(`/instagram-feeds/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  activate: (id) => request(`/instagram-feeds/${id}/activate`, { method: 'PATCH' }),
  deactivate: (id) => request(`/instagram-feeds/${id}/deactivate`, { method: 'PATCH' }),
  delete: (id) => request(`/instagram-feeds/${id}`, { method: 'DELETE' }),
  fetch: (id) => request(`/instagram-feeds/${id}/fetch`, { method: 'POST' }),
  fetchAll: () => request('/instagram-feeds/fetch-all', { method: 'POST' }),
};
