import { describe, expect, it } from 'vitest'
import type { Prompt2BlogArticleTypeOption } from '../api'
import { buildGroupedArticleTypes, getArticleTypeQuickPicks } from './article-type-options'

// The 42 names seeded by apps/backend/scripts/populate_article_types.py.
const ARTICLE_TYPE_NAMES = [
  'How-to Guides', 'Disqualifiers', 'Opinion Piece', 'In-depth Analysis', 'Interview',
  'News Article', 'Feature Story', 'Case Study', 'Listicle', 'Explainer',
  "Beginner's Guide", 'FAQ Article', 'Myth-Busting Article', 'Comparison Article',
  'Pros & Cons Breakdown', "Buyer's Guide", 'Review', 'Roundup', 'Best Of',
  'Cost Breakdown', 'Checklist', 'Resource List', 'Survival Guide', 'Destination Guide',
  'Itinerary Article', 'Travel Diary', 'Where to Stay Guide', 'When to Visit Article',
  'Budget Travel Guide', 'Luxury Travel Guide', 'Solo Travel Guide', 'Family Travel Guide',
  'Digital Nomad Guide', 'Packing Guide', 'Visa & Entry Guide', 'Safety Guide',
  'Cultural Etiquette Guide', 'Transportation Guide', 'Travel Inspiration Piece',
  'Hidden Gems Article', 'Food Travel Guide', 'Adventure Guide',
]

const ARTICLE_TYPES: Prompt2BlogArticleTypeOption[] = ARTICLE_TYPE_NAMES.map(
  (name, index) => ({ id: index + 1, name, definition: `${name} definition` }),
)

describe('buildGroupedArticleTypes', () => {
  it('places every article type in a curated group', () => {
    // Anything the curated lists miss falls through to a "More Formats" bucket,
    // which is where Pros & Cons Breakdown silently sat.
    const groups = buildGroupedArticleTypes(ARTICLE_TYPES)

    expect(groups.map(group => group.label)).not.toContain('More Formats')
  })

  it('accounts for every article type exactly once', () => {
    const grouped = buildGroupedArticleTypes(ARTICLE_TYPES).flatMap(group =>
      group.options.map(option => option.name),
    )

    expect(grouped).toHaveLength(ARTICLE_TYPE_NAMES.length)
    expect(new Set(grouped).size).toBe(ARTICLE_TYPE_NAMES.length)
  })

  it('still buckets an unrecognised article type rather than dropping it', () => {
    const groups = buildGroupedArticleTypes([
      ...ARTICLE_TYPES,
      { id: 999, name: 'Brand New Format', definition: 'Something new' },
    ])

    expect(groups[groups.length - 1]).toMatchObject({
      label: 'More Formats',
      options: [expect.objectContaining({ name: 'Brand New Format' })],
    })
  })

  it('omits a group when none of its article types are available', () => {
    const groups = buildGroupedArticleTypes(
      ARTICLE_TYPES.filter(option => option.name === 'Destination Guide'),
    )

    expect(groups).toHaveLength(1)
    expect(groups[0].label).toBe('Travel Planning')
  })
})

describe('getArticleTypeQuickPicks', () => {
  it('resolves every quick pick against the catalog', () => {
    // A typo here yields a silently shorter chip row rather than an error.
    expect(getArticleTypeQuickPicks(ARTICLE_TYPES)).toHaveLength(10)
  })
})
