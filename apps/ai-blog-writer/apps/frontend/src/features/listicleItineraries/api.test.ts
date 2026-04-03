import { describe, expect, it, vi } from 'vitest'
import { fetchLocations, generateListicleContentWithAi } from './api'

describe('listicleItineraries api', () => {
  it('paginates all location pages', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          docs: [{ id: 1, locationKey: 'peru|lima' }],
          totalDocs: 2,
          totalPages: 2,
        }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          docs: [{ id: 2, locationKey: 'peru|cusco' }],
          totalDocs: 2,
          totalPages: 2,
        }),
      })

    vi.stubGlobal('fetch', fetchMock)

    await expect(fetchLocations('token-123')).resolves.toEqual([
      { id: 1, locationKey: 'peru|lima' },
      { id: 2, locationKey: 'peru|cusco' },
    ])

    expect(fetchMock).toHaveBeenCalledTimes(2)
    expect(fetchMock.mock.calls[0]?.[0]).toContain('/api/locations?limit=200&page=1&depth=0')
    expect(fetchMock.mock.calls[1]?.[0]).toContain('/api/locations?limit=200&page=2&depth=0')
  })

  it('posts listicle generation requests with snake_case payload keys', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        results: {
          intro: {
            target_id: 'intro',
            status: 'generated',
            markdown: 'Fresh intro copy',
            model_used: 'gemini-2.5-flash',
            source_urls: ['https://example.com'],
            validation_errors: [],
          },
        },
      }),
    })

    vi.stubGlobal('fetch', fetchMock)

    await expect(generateListicleContentWithAi({
      articleTitle: 'One Perfect Day in Lima',
      articleType: 'listicle-itinerary',
      locationLabel: 'Lima, Peru',
      articleContext: '### Intro\nDraft intro',
      modelName: 'gemini-2.5-flash',
      customInstruction: 'Make it tighter.',
      skipExisting: true,
      targets: [
        {
          targetId: 'intro',
          fieldType: 'intro',
          locationLabel: 'Lima, Peru',
          currentContent: '',
          supportingContext: 'Day audience: weekend',
        },
      ],
    })).resolves.toEqual({
      results: {
        intro: {
          target_id: 'intro',
          status: 'generated',
          markdown: 'Fresh intro copy',
          model_used: 'gemini-2.5-flash',
          source_urls: ['https://example.com'],
          validation_errors: [],
        },
      },
    })

    const requestBody = JSON.parse(fetchMock.mock.calls[0]?.[1]?.body as string) as Record<string, unknown>
    expect(fetchMock.mock.calls[0]?.[0]).toContain('/editor-assist/generate-listicle-content')
    expect(requestBody).toMatchObject({
      article_title: 'One Perfect Day in Lima',
      article_type: 'listicle-itinerary',
      location_label: 'Lima, Peru',
      article_context: '### Intro\nDraft intro',
      model_name: 'gemini-2.5-flash',
      custom_instruction: 'Make it tighter.',
      skip_existing: true,
      targets: [
        {
          target_id: 'intro',
          field_type: 'intro',
          location_label: 'Lima, Peru',
          current_content: '',
          supporting_context: 'Day audience: weekend',
        },
      ],
    })
  })
})
