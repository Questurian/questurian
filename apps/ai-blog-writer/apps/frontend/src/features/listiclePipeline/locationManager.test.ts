import { describe, expect, it } from 'vitest'
import { addToLocationManagerUrl, locationManagerEditUrl } from './locationManager'

describe('Location Manager links', () => {
  it("opens the Add form for the list's one type, with the place filled in", () => {
    const url = new URL(
      addToLocationManagerUrl(
        {
          name: 'Juno Wings',
          address: 'Av. Grau 123, Barranco',
          tripadvisor_url: '',
        },
        'dining',
      ),
    )
    expect(url.pathname).toBe('/add/dining')
    expect(url.searchParams.get('name')).toBe('Juno Wings')
    expect(url.searchParams.get('address')).toBe('Av. Grau 123, Barranco')
    expect(url.searchParams.has('tripadvisorUrl')).toBe(false)
  })

  it('links a matched place to its edit screen', () => {
    expect(
      locationManagerEditUrl({ id: 164, category: 'nightlife' }),
    ).toMatch(/\/edit\/nightlife\/164$/)
  })
})
