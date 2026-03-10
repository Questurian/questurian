import { request } from '../client';
import { withQuery } from '../utils/queryParams';

export const batchFetchApi = {
  start: (params = {}) =>
    request(withQuery('/batch-fetch', params), { method: 'POST' }),
  getCurrent: () => request('/batch-fetch/current'),
  getById: (id) => request(`/batch-fetch/${id}`),
  getAll: (params = {}) => request(withQuery('/batch-fetch', params)),
};
