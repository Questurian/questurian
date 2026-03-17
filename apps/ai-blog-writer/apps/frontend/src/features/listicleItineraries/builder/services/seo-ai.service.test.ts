import { buildSeoAiPrompt, parseSeoAiPatch } from './seo-ai.service'

describe('listicleItineraries seo ai service', () => {
  it('includes itinerary structured-data guardrails in the prompt', () => {
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

    expect(prompt).toContain('keep @graph nodes for BlogPosting + Trip + ItemList')
    expect(prompt).toContain('preserve BlogPosting author, publisher, image, datePublished, dateModified, url, and mainEntityOfPage when present')
    expect(prompt).toContain('Structured data stop count to preserve: 1')
  })

  it('sanitizes itinerary structured data descriptions', () => {
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

    expect(blogDescription.length).toBeGreaterThan(0)
    expect(entityDescription.length).toBeGreaterThan(0)
    expect(blogDescription.length).toBeLessThanOrEqual(220)
    expect(entityDescription.length).toBeLessThanOrEqual(220)
    expect(blogDescription).not.toMatch(/^discover\s+/i)
    expect(entityDescription).not.toMatch(/^discover\s+/i)
  })
})
