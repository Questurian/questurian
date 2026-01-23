const DEFAULT_API_BASE = 'http://localhost:4004';
export const API_BASE = import.meta.env.VITE_API_BASE || DEFAULT_API_BASE;

export function instagramPostImageUrl(postId) {
  return `${API_BASE}/instagram-feeds/posts/${postId}/image`;
}

async function request(endpoint, options = {}) {
  const response = await fetch(`${API_BASE}${endpoint}`, {
    headers: {
      'Content-Type': 'application/json',
      ...options.headers,
    },
    ...options,
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({ detail: 'An error occurred' }));
    const err = new Error(error.detail || 'An error occurred');
    err.status = response.status;
    throw err;
  }

  if (response.status === 204) {
    return null;
  }

  return response.json();
}

// Categories API
export const categoriesApi = {
  getAll: (params = {}) => {
    const query = new URLSearchParams(params).toString();
    return request(`/categories${query ? `?${query}` : ''}`);
  },
  getById: (id) => request(`/categories/${id}`),
  create: (data) => request('/categories', { method: 'POST', body: JSON.stringify(data) }),
  update: (id, data) => request(`/categories/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  delete: (id) => request(`/categories/${id}`, { method: 'DELETE' }),
};

export const countriesApi = {
  getAll: (params = {}) => {
    const query = new URLSearchParams(params).toString();
    return request(`/countries${query ? `?${query}` : ''}`);
  },
  getById: (id) => request(`/countries/${id}`),
  create: (data) => request('/countries', { method: 'POST', body: JSON.stringify(data) }),
  update: (id, data) => request(`/countries/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  delete: (id) => request(`/countries/${id}`, { method: 'DELETE' }),
};

// Feeds API
export const feedsApi = {
  getAll: (params = {}) => {
    const query = new URLSearchParams(params).toString();
    return request(`/feeds${query ? `?${query}` : ''}`);
  },
  getById: (id) => request(`/feeds/${id}`),
  getByCategory: (categoryId) => request(`/feeds/category/${categoryId}`),
  create: (data) => request('/feeds', { method: 'POST', body: JSON.stringify(data) }),
  update: (id, data) => request(`/feeds/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  activate: (id) => request(`/feeds/${id}/activate`, { method: 'PATCH' }),
  deactivate: (id) => request(`/feeds/${id}/deactivate`, { method: 'PATCH' }),
  delete: (id) => request(`/feeds/${id}`, { method: 'DELETE' }),
  fetch: (id) => request(`/feeds/${id}/fetch`, { method: 'POST' }),
  fetchAll: () => request('/feeds/fetch-all', { method: 'POST' }),
};

// Tags API
export const tagsApi = {
  getAll: () => request('/tags'),
  getById: (id) => request(`/tags/${id}`),
  create: (data) => request('/tags', { method: 'POST', body: JSON.stringify(data) }),
  update: (id, data) => request(`/tags/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  delete: (id) => request(`/tags/${id}`, { method: 'DELETE' }),
  getFeedTags: (feedId) => request(`/tags/feeds/${feedId}/tags`),
  addToFeed: (feedId, tagId) => request(`/tags/feeds/${feedId}/tags/${tagId}`, { method: 'POST' }),
  removeFromFeed: (feedId, tagId) => request(`/tags/feeds/${feedId}/tags/${tagId}`, { method: 'DELETE' }),
  updateFeedTags: (feedId, tags) => request(`/tags/feeds/${feedId}/tags`, { method: 'PUT', body: JSON.stringify({ tags }) }),
};

// Leads API
export const leadsApi = {
  getAll: (params = {}) => {
    const query = new URLSearchParams(params).toString();
    return request(`/leads${query ? `?${query}` : ''}`);
  },
  getById: (id) => request(`/leads/${id}`),
  getByFeed: (feedId, params = {}) => {
    const query = new URLSearchParams(params).toString();
    return request(`/leads/feed/${feedId}${query ? `?${query}` : ''}`);
  },
  getByTag: (tagName, params = {}) => {
    const query = new URLSearchParams(params).toString();
    return request(`/leads/tag/${tagName}${query ? `?${query}` : ''}`);
  },
  getByCategory: (categoryName, params = {}) => {
    const query = new URLSearchParams(params).toString();
    return request(`/leads/category/${categoryName}${query ? `?${query}` : ''}`);
  },
  create: (data) => request('/leads', { method: 'POST', body: JSON.stringify(data) }),
  update: (id, data) => request(`/leads/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  delete: (id) => request(`/leads/${id}`, { method: 'DELETE' }),
};

// Fetch Logs API
export const fetchLogsApi = {
  getAll: (params = {}) => {
    const query = new URLSearchParams(params).toString();
    return request(`/logs${query ? `?${query}` : ''}`);
  },
  getById: (id) => request(`/logs/${id}`),
  getByFeed: (feedId, params = {}) => {
    const query = new URLSearchParams(params).toString();
    return request(`/logs/feed/${feedId}${query ? `?${query}` : ''}`);
  },
  delete: (id) => request(`/logs/${id}`, { method: 'DELETE' }),
};

// Development API
export const devApi = {
  clearAll: () => request('/dev/clear-all', { method: 'DELETE' }),
  clearFetched: () => request('/dev/clear-fetched', { method: 'DELETE' }),
};

// Batch Fetch API
export const batchFetchApi = {
  start: (params = {}) => {
    const query = new URLSearchParams(params).toString();
    return request(`/batch-fetch${query ? `?${query}` : ''}`, { method: 'POST' });
  },
  getCurrent: () => request('/batch-fetch/current'),
  getById: (id) => request(`/batch-fetch/${id}`),
  getAll: (params = {}) => {
    const query = new URLSearchParams(params).toString();
    return request(`/batch-fetch${query ? `?${query}` : ''}`);
  },
};

// Instagram Feeds API
export const instagramFeedsApi = {
  getAll: (params = {}) => {
    const query = new URLSearchParams(params).toString();
    return request(`/instagram-feeds${query ? `?${query}` : ''}`);
  },
  getById: (id) => request(`/instagram-feeds/${id}`),
  create: (data) => request('/instagram-feeds', { method: 'POST', body: JSON.stringify(data) }),
  update: (id, data) => request(`/instagram-feeds/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  activate: (id) => request(`/instagram-feeds/${id}/activate`, { method: 'PATCH' }),
  deactivate: (id) => request(`/instagram-feeds/${id}/deactivate`, { method: 'PATCH' }),
  delete: (id) => request(`/instagram-feeds/${id}`, { method: 'DELETE' }),
  fetch: (id) => request(`/instagram-feeds/${id}/fetch`, { method: 'POST' }),
  fetchAll: () => request('/instagram-feeds/fetch-all', { method: 'POST' }),
};

// Instagram Posts API
export const instagramPostsApi = {
  getAll: (params = {}) => {
    const query = new URLSearchParams(params).toString();
    return request(`/instagram-feeds/posts${query ? `?${query}` : ''}`);
  },
  getById: (id) => request(`/instagram-feeds/posts/${id}`),
  delete: (id) => request(`/instagram-feeds/posts/${id}`, { method: 'DELETE' }),
};

// El Comercio Feeds API
export const elComercioFeedsApi = {
  getAll: (params = {}) => {
    const query = new URLSearchParams(params).toString();
    return request(`/el-comercio-feeds${query ? `?${query}` : ''}`);
  },
  getById: (id) => request(`/el-comercio-feeds/${id}`),
  fetch: () => request('/el-comercio-feeds/fetch', { method: 'POST' }),
  fetchAll: () => request('/el-comercio-feeds/fetch-all', { method: 'POST' }),
};

// El Comercio Posts API
export const elComercioPostsApi = {
  getAll: (params = {}) => {
    const query = new URLSearchParams(params).toString();
    return request(`/el-comercio-feeds/posts${query ? `?${query}` : ''}`);
  },
  getById: (id) => request(`/el-comercio-feeds/posts/${id}`),
  delete: (id) => request(`/el-comercio-feeds/posts/${id}`, { method: 'DELETE' }),
};

// Diario Correo Feeds API
export const diarioCorreoFeedsApi = {
  getAll: (params = {}) => {
    const query = new URLSearchParams(params).toString();
    return request(`/diario-correo-feeds${query ? `?${query}` : ''}`);
  },
  getById: (id) => request(`/diario-correo-feeds/${id}`),
  fetch: () => request('/diario-correo-feeds/fetch', { method: 'POST' }),
  fetchAll: () => request('/diario-correo-feeds/fetch-all', { method: 'POST' }),
};

// Diario Correo Posts API
export const diarioCorreoPostsApi = {
  getAll: (params = {}) => {
    const query = new URLSearchParams(params).toString();
    return request(`/diario-correo-feeds/posts${query ? `?${query}` : ''}`);
  },
  getById: (id) => request(`/diario-correo-feeds/posts/${id}`),
};

// YouTube Feeds API
export const youtubeFeedsApi = {
  getAll: (params = {}) => {
    const query = new URLSearchParams(params).toString();
    return request(`/youtube-feeds${query ? `?${query}` : ''}`);
  },
  getById: (id) => request(`/youtube-feeds/${id}`),
  create: (data) => request('/youtube-feeds', { method: 'POST', body: JSON.stringify(data) }),
  update: (id, data) => request(`/youtube-feeds/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  delete: (id) => request(`/youtube-feeds/${id}`, { method: 'DELETE' }),
  searchChannel: (params = {}) => {
    const query = new URLSearchParams(params).toString();
    return request(`/youtube-feeds/channel-search${query ? `?${query}` : ''}`);
  },
  fetch: (id, params = {}) => {
    const query = new URLSearchParams(params).toString();
    return request(`/youtube-feeds/${id}/fetch${query ? `?${query}` : ''}`, { method: 'POST' });
  },
  fetchAll: (params = {}) => {
    const query = new URLSearchParams(params).toString();
    return request(`/youtube-feeds/fetch-all${query ? `?${query}` : ''}`, { method: 'POST' });
  },
};

// YouTube Posts API
export const youtubePostsApi = {
  getAll: (params = {}) => {
    const query = new URLSearchParams(params).toString();
    return request(`/youtube-feeds/posts${query ? `?${query}` : ''}`);
  },
  getById: (id) => request(`/youtube-feeds/posts/${id}`),
  delete: (id) => request(`/youtube-feeds/posts/${id}`, { method: 'DELETE' }),
  getTranscript: (id) => request(`/youtube-feeds/posts/${id}/transcript`),
  extractTranscript: (id) => request(`/youtube-feeds/posts/${id}/transcript`, { method: 'POST' }),
  downloadTranscriptUrl: (id) => `${API_BASE}/youtube-feeds/posts/${id}/transcript/download`,
};

// Unified Scrapes API
export const scrapesApi = {
  getAll: (params = {}) => {
    const query = new URLSearchParams(params).toString();
    return request(`/scrapes${query ? `?${query}` : ''}`);
  },
};

// Subreddits API
export const subredditsApi = {
  getAll: (params = {}) => {
    const query = new URLSearchParams(params).toString();
    return request(`/subreddits${query ? `?${query}` : ''}`);
  },
  getById: (id) => request(`/subreddits/${id}`),
  create: (data) => request('/subreddits', { method: 'POST', body: JSON.stringify(data) }),
  update: (id, data) => request(`/subreddits/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  delete: (id) => request(`/subreddits/${id}`, { method: 'DELETE' }),
};

// Translation API
export const translationApi = {
  translateBatch: (data) => request('/translate/batch', { method: 'POST', body: JSON.stringify(data) }),
  translateLeads: (params = {}) => {
    // Filter out empty values to avoid sending empty strings for integer fields
    const filteredParams = Object.fromEntries(
      Object.entries(params).filter(([_, value]) => value !== '' && value != null)
    );
    const query = new URLSearchParams(filteredParams).toString();
    return request(`/translate/leads${query ? `?${query}` : ''}`, { method: 'POST' });
  },
  translateInstagramPosts: (params = {}) => {
    const filteredParams = Object.fromEntries(
      Object.entries(params).filter(([_, value]) => value !== '' && value != null)
    );
    const query = new URLSearchParams(filteredParams).toString();
    return request(`/translate/instagram-posts${query ? `?${query}` : ''}`, { method: 'POST' });
  },
  translateRedditPosts: (params = {}) => {
    const filteredParams = Object.fromEntries(
      Object.entries(params).filter(([_, value]) => value !== '' && value != null)
    );
    const query = new URLSearchParams(filteredParams).toString();
    return request(`/translate/reddit-posts${query ? `?${query}` : ''}`, { method: 'POST' });
  },
  getStats: () => request('/translate/stats'),
  detectMissingLanguages: (force = false) => {
    const query = force ? '?force=true' : '';
    return request(`/translate/detect-languages${query}`, { method: 'POST' });
  },
};

// Approval API
export const approvalApi = {
  getPending: (contentType = null, limit = 100, offset = 0) => {
    const params = new URLSearchParams({ limit, offset });
    if (contentType) params.append('content_type', contentType);
    return request(`/approval/pending?${params}`);
  },

  approve: (contentType, contentId, approvedBy, notes = null) => {
    return request('/approval/approve', {
      method: 'POST',
      body: JSON.stringify({
        content_type: contentType,
        content_id: contentId,
        status: 'approved',
        approved_by: approvedBy,
        approval_notes: notes
      })
    });
  },

  reject: (contentType, contentId, approvedBy, notes = null) => {
    return request('/approval/approve', {
      method: 'POST',
      body: JSON.stringify({
        content_type: contentType,
        content_id: contentId,
        status: 'rejected',
        approved_by: approvedBy,
        approval_notes: notes
      })
    });
  },

  batchApprove: (items) => {
    return request('/approval/approve/batch', {
      method: 'POST',
      body: JSON.stringify({ items })
    });
  },

  getStats: () => request('/approval/stats')
};
