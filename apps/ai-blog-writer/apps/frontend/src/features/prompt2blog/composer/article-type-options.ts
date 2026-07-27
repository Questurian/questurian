import type { Prompt2BlogArticleTypeOption, Prompt2BlogInputOption } from '../api'

const ARTICLE_TYPE_GROUPS: Array<{ label: string; names: string[] }> = [
  {
    label: 'Travel Planning',
    names: [
      'Destination Guide', 'Itinerary Article', 'Where to Stay Guide', 'When to Visit Article',
      'Hidden Gems Article', 'Best Of', 'Listicle', 'Roundup',
    ],
  },
  {
    label: 'Traveler Profiles',
    names: [
      'Budget Travel Guide', 'Luxury Travel Guide', 'Solo Travel Guide', 'Family Travel Guide',
      'Digital Nomad Guide', 'Food Travel Guide', 'Adventure Guide', 'Travel Inspiration Piece',
    ],
  },
  {
    label: 'Logistics & Practical',
    names: [
      'Transportation Guide', 'Packing Guide', 'Visa & Entry Guide', 'Safety Guide',
      'Cultural Etiquette Guide', 'Checklist', 'Cost Breakdown', 'Resource List',
      // Filters an audience out rather than serving one, so it sits with the
      // other decision-support formats rather than under Editorial Formats.
      'Disqualifiers',
    ],
  },
  {
    label: 'Editorial Formats',
    names: [
      'Explainer', 'Beginner\'s Guide', 'FAQ Article', 'How-to Guides', 'Comparison Article',
      'Pros & Cons Breakdown', 'Review', 'Myth-Busting Article', 'Feature Story',
      'Travel Diary', 'In-depth Analysis', 'Opinion Piece', 'Interview', 'Case Study',
      'News Article', 'Buyer\'s Guide', 'Survival Guide',
    ],
  },
]

const ARTICLE_TYPE_QUICK_PICK_NAMES = [
  'Destination Guide', 'Itinerary Article', 'Hidden Gems Article', 'Food Travel Guide',
  'Adventure Guide', 'Family Travel Guide', 'Solo Travel Guide', 'Budget Travel Guide',
  'Luxury Travel Guide', 'Where to Stay Guide',
]

export function findDefaultOption(options: Prompt2BlogInputOption[]): string {
  return options.find(option => option.default)?.id || options[0]?.id || ''
}

export function buildGroupedArticleTypes(articleTypes: Prompt2BlogArticleTypeOption[]) {
  const optionsByName = new Map(articleTypes.map(option => [option.name, option]))
  const groupedNames = new Set<string>()
  const groups = ARTICLE_TYPE_GROUPS.map(group => {
    const options = group.names
      .map(name => optionsByName.get(name) || null)
      .filter((option): option is Prompt2BlogArticleTypeOption => Boolean(option))
    options.forEach(option => groupedNames.add(option.name))
    return { label: group.label, options }
  }).filter(group => group.options.length > 0)
  const remaining = articleTypes
    .filter(option => !groupedNames.has(option.name))
    .sort((left, right) => left.name.localeCompare(right.name))
  if (remaining.length) groups.push({ label: 'More Formats', options: remaining })
  return groups
}

export function getArticleTypeQuickPicks(articleTypes: Prompt2BlogArticleTypeOption[]) {
  const optionsByName = new Map(articleTypes.map(option => [option.name, option]))
  return ARTICLE_TYPE_QUICK_PICK_NAMES
    .map(name => optionsByName.get(name) || null)
    .filter((option): option is Prompt2BlogArticleTypeOption => Boolean(option))
}
