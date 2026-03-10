import { request } from '../client';
import { withQuery } from '../utils/queryParams';

export const countriesApi = {
  getAll: (params = {}) => request(withQuery('/countries', params)),
  getById: (id) => request(`/countries/${id}`),
  create: (data) =>
    request('/countries', { method: 'POST', body: JSON.stringify(data) }),
  update: (id, data) =>
    request(`/countries/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  delete: (id) => request(`/countries/${id}`, { method: 'DELETE' }),
};
