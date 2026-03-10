import { request } from '../client';
import { withQuery } from '../utils/queryParams';

export const subredditsApi = {
  getAll: (params = {}) => request(withQuery('/subreddits', params)),
  getById: (id) => request(`/subreddits/${id}`),
  create: (data) =>
    request('/subreddits', { method: 'POST', body: JSON.stringify(data) }),
  update: (id, data) =>
    request(`/subreddits/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  delete: (id) => request(`/subreddits/${id}`, { method: 'DELETE' }),
};
