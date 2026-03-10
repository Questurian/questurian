import { request } from '../client';
import { withQuery } from '../utils/queryParams';

export const scrapeJobsApi = {
  getCurrent: (params = {}) => request(withQuery('/scrape-jobs/current', params)),
  getById: (id) => request(`/scrape-jobs/${id}`),
  getAll: (params = {}) => request(withQuery('/scrape-jobs', params)),
};
