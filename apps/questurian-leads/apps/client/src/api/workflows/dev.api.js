import { request } from '../client';

export const devApi = {
  clearAll: () => request('/dev/clear-all', { method: 'DELETE' }),
  clearFetched: () => request('/dev/clear-fetched', { method: 'DELETE' }),
};
