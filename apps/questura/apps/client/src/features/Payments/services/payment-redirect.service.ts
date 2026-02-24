export function redirectToUrl(url?: string | null): void {
  if (!url) return;
  window.location.href = url;
}
