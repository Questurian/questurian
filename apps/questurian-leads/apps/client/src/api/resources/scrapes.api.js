import { request } from '../client';
import { withQuery } from '../utils/queryParams';

export const scrapesApi = {
  getAll: (params = {}) => request(withQuery('/scrapes', params)),
};
