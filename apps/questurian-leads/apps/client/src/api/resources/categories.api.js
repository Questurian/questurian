import { request } from '../client';
import { withQuery } from '../utils/queryParams';

export const categoriesApi = {
  getAll: (params = {}) => request(withQuery('/categories', params)),
  getById: (id) => request(`/categories/${id}`),
  create: (data) =>
    request('/categories', { method: 'POST', body: JSON.stringify(data) }),
  update: (id, data) =>
    request(`/categories/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  delete: (id) => request(`/categories/${id}`, { method: 'DELETE' }),
};
