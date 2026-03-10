import { request } from '../client';
import { filterEmptyParams, withQuery } from '../utils/queryParams';

export const translationApi = {
  translateBatch: (data) =>
    request('/translate/batch', { method: 'POST', body: JSON.stringify(data) }),
  translateLeads: (params = {}) =>
    request(withQuery('/translate/leads', filterEmptyParams(params)), {
      method: 'POST',
    }),
  translateInstagramPosts: (params = {}) =>
    request(withQuery('/translate/instagram-posts', filterEmptyParams(params)), {
      method: 'POST',
    }),
  translateRedditPosts: (params = {}) =>
    request(withQuery('/translate/reddit-posts', filterEmptyParams(params)), {
      method: 'POST',
    }),
  getStats: () => request('/translate/stats'),
  detectMissingLanguages: (force = false) =>
    request(`/translate/detect-languages${force ? '?force=true' : ''}`, {
      method: 'POST',
    }),
};
