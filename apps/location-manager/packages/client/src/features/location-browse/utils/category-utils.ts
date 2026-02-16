/**
 * Get Tailwind CSS classes for category badge styling
 * @param category - Location category (accommodations, nightlife, dining, attractions)
 * @returns CSS classes for badge background and text color
 */
export function getCategoryBadgeStyles(category: string): string {
  const categoryLower = category.toLowerCase();

  switch (categoryLower) {
    case 'accommodations':
      return 'bg-blue-500/15 text-blue-400';
    case 'nightlife':
      return 'bg-purple-500/15 text-purple-400';
    case 'dining':
      return 'bg-orange-500/15 text-orange-400';
    case 'attractions':
      return 'bg-emerald-500/15 text-emerald-400';
    default:
      return 'bg-muted text-muted-foreground';
  }
}
