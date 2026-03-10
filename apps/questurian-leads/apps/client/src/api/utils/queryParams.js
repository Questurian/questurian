export function buildQueryString(params = {}) {
  return new URLSearchParams(params).toString();
}

export function withQuery(path, params = {}) {
  const query = buildQueryString(params);
  return `${path}${query ? `?${query}` : ''}`;
}

export function filterEmptyParams(params = {}) {
  return Object.fromEntries(
    Object.entries(params).filter(([, value]) => value !== '' && value != null),
  );
}
