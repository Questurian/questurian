import { buildSeoAiPrompt, parseSeoAiPatch } from './seo-ai.service'

const assert = (condition: unknown, message: string) => {
  if (!condition) throw new Error(message)
}

function runPromptRulesTest() {
  const prompt = buildSeoAiPrompt({
    articleType: 'listicle-itinerary',
    location: 'Lima, Peru',
    dayAudience: 'anyday',
    itineraryWindow: '09:00 - 18:00',
    target: 'structuredData',
    structuredDataTemplate: JSON.stringify({
      '@context': 'https://schema.org',
      '@graph': [
        { '@type': 'BlogPosting' },
        { '@type': 'Trip' },
        {
          '@type': 'ItemList',
          itemListElement: [{ '@type': 'ListItem', position: 1 }],
        },
      ],
    }),
  })

  assert(
    prompt.includes('keep @graph nodes for BlogPosting + Trip + ItemList'),
    'Expected prompt to include graph node preservation guidance.',
  )
  assert(
    prompt.includes('preserve BlogPosting author, publisher, image, datePublished, dateModified, url, and mainEntityOfPage when present'),
    'Expected prompt to preserve article-level BlogPosting metadata.',
  )
  assert(
    prompt.includes('Structured data stop count to preserve: 1'),
    'Expected prompt to include stop count summary.',
  )
}

function runStructuredDataSanitizerTest() {
  const aiResponse = JSON.stringify({
    structuredData: {
      '@context': 'https://schema.org',
      '@graph': [
        {
          '@type': 'BlogPosting',
          description: 'Discover this full-day itinerary with endless amazing highlights and top-rated experiences that make it one of the best possible days in the city for absolutely everyone looking for unforgettable moments all day long.',
        },
        { '@type': 'Trip' },
        {
          '@type': 'ItemList',
          itemListElement: [
            {
              '@type': 'ListItem',
              position: 1,
              item: {
                '@type': 'Restaurant',
                name: 'Brunch Spot',
                description: 'Discover this must-visit brunch place with world-class flavors and unforgettable atmosphere for everyone in town.',
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
  const itemList = graph[2] as Record<string, unknown> | undefined
  const itemListElement = Array.isArray(itemList?.itemListElement) ? itemList.itemListElement : []
  const firstListItem = itemListElement[0] as Record<string, unknown> | undefined
  const firstEntity = (firstListItem?.item && typeof firstListItem.item === 'object')
    ? firstListItem.item as Record<string, unknown>
    : undefined

  const blogDescription = typeof blogPosting?.description === 'string' ? blogPosting.description : ''
  const entityDescription = typeof firstEntity?.description === 'string' ? firstEntity.description : ''

  assert(blogDescription.length > 0, 'Expected BlogPosting description to remain after sanitization.')
  assert(entityDescription.length > 0, 'Expected item description to remain after sanitization.')
  assert(blogDescription.length <= 220, 'Expected BlogPosting description to be capped at 220 chars.')
  assert(entityDescription.length <= 220, 'Expected item description to be capped at 220 chars.')
  assert(!/^discover\s+/i.test(blogDescription), 'Expected sanitized BlogPosting description without promotional lead-in.')
  assert(!/^discover\s+/i.test(entityDescription), 'Expected sanitized item description without promotional lead-in.')
}

runPromptRulesTest()
runStructuredDataSanitizerTest()
