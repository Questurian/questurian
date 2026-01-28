/**
 * Format a location slug/name for display (convert kebab-case to Title Case)
 * @param slug - Slug like "santa-teresita" or "rio-de-janeiro"
 * @returns Display name like "Santa Teresita" or "Rio De Janeiro"
 */
export function formatLocationName(slug: string): string {
  return slug
    .split('-')
    .map(word => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
}

/**
 * Format a location hierarchy key for display
 * @param locationKey - Location key like "colombia|medellin|el-poblado"
 * @returns Formatted display string like "Colombia > Medellin > El Poblado"
 */
export function formatLocationHierarchy(locationKey: string): string {
  return locationKey
    .split("|")
    .map(segment => formatLocationName(segment))
    .join(" > ");
}









