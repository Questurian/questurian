import { request } from '../client';
import { withQuery } from '../utils/queryParams';

export const diarioCorreoFeedsApi = {
  getAll: (params = {}) => request(withQuery('/diario-correo-feeds', params)),
  getById: (id) => request(`/diario-correo-feeds/${id}`),
  fetch: () => request('/diario-correo-feeds/fetch', { method: 'POST' }),
  fetchAll: () => request('/diario-correo-feeds/fetch-all', { method: 'POST' }),
};
