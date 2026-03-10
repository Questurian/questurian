import { request } from '../client';
import { withQuery } from '../utils/queryParams';

export const elComercioPostsApi = {
  getAll: (params = {}) => request(withQuery('/el-comercio-feeds/posts', params)),
  getById: (id) => request(`/el-comercio-feeds/posts/${id}`),
  delete: (id) => request(`/el-comercio-feeds/posts/${id}`, { method: 'DELETE' }),
};
