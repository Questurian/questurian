import { buildSeoAiPrompt, parseSeoAiPatch } from './seo-ai.service'

const assert = (condition: unknown, message: string) => {
  if (!condition) throw new Error(message)
}

function buildLongDescription(): string {
  return 'Discover this world-class destination with top-rated experiences and unforgettable moments designed for every traveler. '.repeat(6).trim()
}

function runPromptRulesTest() {
  const prompt = buildSeoAiPrompt({
    articleType: 'single-type-listicle (dining)',
    location: 'Lima, Peru',
    target: 'structuredData',
    structuredDataTemplate: JSON.stringify({
      '@context': 'https://schema.org',
      '@graph': [
        { '@type': 'BlogPosting' },
        {
          '@type': 'ItemList',
          itemListElement: [
            {
              '@type': 'ListItem',
              position: 1,
              item: { '@type': 'Restaurant', name: 'Blu Gelateria' },
            },
          ],
        },
      ],
    }),
  })

  assert(
    prompt.includes('keep every "description" concise and factual (max 220 chars)'),
    'Expected prompt to include concise structured-data description rule.',
  )
  assert(
    prompt.includes('avoid marketing tone, keyword stuffing, and sales language'),
    'Expected prompt to include anti-marketing structured-data rule.',
  )
  assert(
    prompt.includes('preserve author, publisher, image, datePublished, dateModified, and mainEntityOfPage when present'),
    'Expected prompt to preserve article metadata fields.',
  )
  assert(
    prompt.includes('Preserve article metadata fields on BlogPosting when they already exist.'),
    'Expected prompt to reinforce BlogPosting metadata preservation.',
  )
}

function runStructuredDataSanitizerTest() {
  const overlong = buildLongDescription()
  const aiResponse = JSON.stringify({
    structuredData: {
      '@context': 'https://schema.org',
      '@graph': [
        {
          '@type': 'BlogPosting',
          description: overlong,
        },
        {
          '@type': 'ItemList',
          itemListElement: [
            {
              '@type': 'ListItem',
              position: 1,
              item: {
                '@type': 'Restaurant',
                name: 'Blu Gelateria',
                description: overlong,
              },
            },
          ],
        },
      ],
    },
  })

  const patch = parseSeoAiPatch(aiResponse)
  const structuredData = JSON.parse(patch.structuredData || '{}') as Record<string, unknown>
  const graph = Array.isArray(structuredData['@graph']) ? structuredData['@graph'] : []
  const blogPosting = graph[0] as Record<string, unknown> | undefined
  const itemList = graph[1] as Record<string, unknown> | undefined
  const itemListElement = Array.isArray(itemList?.itemListElement) ? itemList.itemListElement : []
  const firstListItem = itemListElement[0] as Record<string, unknown> | undefined
  const firstEntity = (firstListItem?.item && typeof firstListItem.item === 'object')
    ? firstListItem.item as Record<string, unknown>
    : undefined

  const blogDescription = typeof blogPosting?.description === 'string' ? blogPosting.description : ''
  const entityDescription = typeof firstEntity?.description === 'string' ? firstEntity.description : ''

  assert(blogDescription.length > 0, 'Expected BlogPosting description to remain after sanitization.')
  assert(entityDescription.length > 0, 'Expected entity description to remain after sanitization.')
  assert(blogDescription.length <= 220, 'Expected BlogPosting description to be capped at 220 chars.')
  assert(entityDescription.length <= 220, 'Expected item description to be capped at 220 chars.')
  assert(!/^discover\s+/i.test(blogDescription), 'Expected sanitizer to strip promotional lead-in from BlogPosting.')
  assert(!/^discover\s+/i.test(entityDescription), 'Expected sanitizer to strip promotional lead-in from list item.')
}

runPromptRulesTest()
runStructuredDataSanitizerTest()
