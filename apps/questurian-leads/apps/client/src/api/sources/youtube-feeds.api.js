import { request } from '../client';
import { withQuery } from '../utils/queryParams';

export const youtubeFeedsApi = {
  getAll: (params = {}) => request(withQuery('/youtube-feeds', params)),
  getById: (id) => request(`/youtube-feeds/${id}`),
  create: (data) =>
    request('/youtube-feeds', { method: 'POST', body: JSON.stringify(data) }),
  update: (id, data) =>
    request(`/youtube-feeds/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  delete: (id) => request(`/youtube-feeds/${id}`, { method: 'DELETE' }),
  searchChannel: (params = {}) => request(withQuery('/youtube-feeds/channel-search', params)),
  fetch: (id, params = {}) =>
    request(withQuery(`/youtube-feeds/${id}/fetch`, params), { method: 'POST' }),
  fetchAll: (params = {}) =>
    request(withQuery('/youtube-feeds/fetch-all', params), { method: 'POST' }),
};
