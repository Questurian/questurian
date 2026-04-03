import { buildSeoAiPrompt, parseSeoAiPatch } from './seo-ai.service'

function buildLongDescription(): string {
  return 'Discover this world-class destination with top-rated experiences and unforgettable moments designed for every traveler. '.repeat(6).trim()
}

describe('singleTypeListicles seo ai service', () => {
  it('includes structured-data guardrails in the prompt', () => {
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

    expect(
      prompt.includes('keep every "description" concise and factual (max 220 chars)')
      || prompt.includes('Keep @graph with BlogPosting + ItemList and preserve ordered list positions.'),
    ).toBe(true)
    expect(
      prompt.includes('avoid marketing tone, keyword stuffing, and sales language')
      || prompt.includes('Preserve BlogPosting author, publisher, image, dates, and mainEntityOfPage when present.'),
    ).toBe(true)
    expect(
      prompt.includes('preserve author, publisher, image, datePublished, dateModified, and mainEntityOfPage when present')
      || prompt.includes('Preserve BlogPosting author, publisher, image, dates, and mainEntityOfPage when present.'),
    ).toBe(true)
    expect(prompt).toContain('Structured data item count to preserve: 1')
  })

  it('sanitizes overlong marketing-heavy structured data descriptions', () => {
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

    expect(blogDescription.length).toBeGreaterThan(0)
    expect(entityDescription.length).toBeGreaterThan(0)
    expect(blogDescription.length).toBeLessThanOrEqual(220)
    expect(entityDescription.length).toBeLessThanOrEqual(220)
    expect(blogDescription).not.toMatch(/^discover\s+/i)
    expect(entityDescription).not.toMatch(/^discover\s+/i)
  })

  it('repairs missing commas between structured-data array elements', () => {
    const aiResponse = `{
      "structuredData": {
        "@context": "https://schema.org",
        "@graph": [
          {
            "@type": "BlogPosting",
            "headline": "Best Cafes in Lima"
          }
          {
            "@type": "ItemList",
            "itemListElement": [
              {
                "@type": "ListItem",
                "position": 1,
                "item": {
                  "@type": "Restaurant",
                  "name": "Cafe One"
                }
              }
              {
                "@type": "ListItem",
                "position": 2,
                "item": {
                  "@type": "Restaurant",
                  "name": "Cafe Two"
                }
              }
            ]
          }
        ]
      }
    }`

    const patch = parseSeoAiPatch(aiResponse)
    const structuredData = JSON.parse(patch.structuredData || '{}') as Record<string, unknown>
    const graph = Array.isArray(structuredData['@graph']) ? structuredData['@graph'] : []
    const itemList = graph[1] as Record<string, unknown> | undefined
    const itemListElement = Array.isArray(itemList?.itemListElement) ? itemList.itemListElement : []

    expect(graph).toHaveLength(2)
    expect(itemListElement).toHaveLength(2)
  })
})
