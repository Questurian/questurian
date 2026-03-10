import { request } from '../client';
import { withQuery } from '../utils/queryParams';

export const diarioCorreoPostsApi = {
  getAll: (params = {}) => request(withQuery('/diario-correo-feeds/posts', params)),
  getById: (id) => request(`/diario-correo-feeds/posts/${id}`),
};
