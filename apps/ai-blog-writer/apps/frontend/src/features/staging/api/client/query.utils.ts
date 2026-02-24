export function appendIfDefined(queryParams: URLSearchParams, key: string, value?: string | number | null) {
  if (value === undefined || value === null || value === '') return
  queryParams.append(key, String(value))
}
