import { describe, expect, it, vi } from 'vitest'
import { fetchItineraries, fetchLocations, generateListicleContentWithAi } from './api'

describe('listicleItineraries api', () => {
  it('fetches itinerary index rows without block fields', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        docs: [{ id: 7, title: 'One Day in Lima', location: 'peru|lima', status: 'draft' }],
      }),
    })

    vi.stubGlobal('fetch', fetchMock)

    await expect(fetchItineraries('token-123')).resolves.toEqual({
      docs: [{ id: 7, title: 'One Day in Lima', location: 'peru|lima', status: 'draft' }],
    })

    const url = new URL(fetchMock.mock.calls[0]?.[0] as string)
    expect(url.pathname).toBe('/api/listicle-itineraries')
    expect(url.searchParams.get('depth')).toBe('0')
    expect(url.searchParams.get('limit')).toBe('100')
    expect(url.searchParams.get('sort')).toBe('-updatedAt')
    expect(url.searchParams.get('select[id]')).toBe('true')
    expect(url.searchParams.get('select[title]')).toBe('true')
    expect(url.searchParams.get('select[location]')).toBe('true')
    expect(url.searchParams.get('select[status]')).toBe('true')
    expect(url.searchParams.get('select[updatedAt]')).toBe('true')
  })

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
            model_used: 'claude-opus-4-8',
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
      modelName: 'claude-opus-4-8',
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
          model_used: 'claude-opus-4-8',
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
      model_name: 'claude-opus-4-8',
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
