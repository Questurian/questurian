import { describe, expect, it, vi } from 'vitest'
import { generateItinerary } from './autobuild.api'

describe('generateItinerary', () => {
  it('posts custom day shell name, description, and slots', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        days: [],
        plan_overview: '',
        model_used: 'gemini-2.5-flash',
        notes: [],
        slot_issues: [],
      }),
    })
    vi.stubGlobal('fetch', fetchMock)

    await generateItinerary({
      location: 'peru|lima',
      title: 'One Perfect Day in Lima',
      brief: 'coffee, culture, tasting night',
      dayCount: 1,
      payloadToken: 'token',
      dayShells: [
        {
          dayIndex: 0,
          shell: {
            id: 'custom_day_shell_1',
            name: 'Coffee culture night',
            description: 'Operator-built layout',
            slots: [
              {
                id: 'morning_coffee_1',
                label: 'Morning coffee',
                daypart: 'morning',
                acceptableCollections: ['dining'],
                preferredCollections: ['dining'],
                intentTags: ['coffee', 'cafe'],
              },
            ],
          },
        },
      ],
    })

    const requestBody = JSON.parse(fetchMock.mock.calls[0]?.[1]?.body as string) as Record<string, unknown>
    expect(requestBody).toMatchObject({
      day_shells: [
        {
          day_index: 0,
          shell_id: 'custom_day_shell_1',
          shell_name: 'Coffee culture night',
          shell_description: 'Operator-built layout',
          slots: [
            {
              id: 'morning_coffee_1',
              label: 'Morning coffee',
              daypart: 'morning',
              acceptable_collections: ['dining'],
              preferred_collections: ['dining'],
              intent_tags: ['coffee', 'cafe'],
              avoid_tags: [],
            },
          ],
        },
      ],
    })
  })
})
