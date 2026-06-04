export function sanitizeLocationName(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, '') // Remove all symbols except spaces and hyphens
    .replace(/\s+/g, '-') // Replace spaces with hyphens
    .replace(/-+/g, '-') // Replace multiple hyphens with single hyphen
    .replace(/^-|-$/g, ''); // Remove leading/trailing hyphens
}

export function getFileExtension(path: string): string {
  const match = path.match(/\.([^.]+)$/);
  return match?.[1] || 'jpg';
}
