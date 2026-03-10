import { request } from '../client';
import { withQuery } from '../utils/queryParams';

export const elComercioFeedsApi = {
  getAll: (params = {}) => request(withQuery('/el-comercio-feeds', params)),
  getById: (id) => request(`/el-comercio-feeds/${id}`),
  fetch: () => request('/el-comercio-feeds/fetch', { method: 'POST' }),
  fetchAll: () => request('/el-comercio-feeds/fetch-all', { method: 'POST' }),
};
