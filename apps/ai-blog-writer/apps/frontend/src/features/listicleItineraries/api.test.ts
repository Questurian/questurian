import { fetchLocations } from './api'

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
})
