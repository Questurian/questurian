import { request } from '../client';
import { withQuery } from '../utils/queryParams';

export const fetchLogsApi = {
  getAll: (params = {}) => request(withQuery('/logs', params)),
  getById: (id) => request(`/logs/${id}`),
  getByFeed: (feedId, params = {}) => request(withQuery(`/logs/feed/${feedId}`, params)),
  delete: (id) => request(`/logs/${id}`, { method: 'DELETE' }),
};
