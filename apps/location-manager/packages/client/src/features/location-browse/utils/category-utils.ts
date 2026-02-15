/**
 * Get Tailwind CSS classes for category badge styling
 * @param category - Location category (accommodations, nightlife, dining, attractions)
 * @returns CSS classes for badge background and text color
 */
export function getCategoryBadgeStyles(category: string): string {
  const categoryLower = category.toLowerCase();

  switch (categoryLower) {
    case 'accommodations':
      return 'bg-blue-50 text-slate-600';
    case 'nightlife':
      return 'bg-purple-50 text-slate-600';
    case 'dining':
      return 'bg-orange-50 text-slate-600';
    case 'attractions':
      return 'bg-green-50 text-slate-600';
    default:
      return 'bg-gray-50 text-slate-600';
  }
}
