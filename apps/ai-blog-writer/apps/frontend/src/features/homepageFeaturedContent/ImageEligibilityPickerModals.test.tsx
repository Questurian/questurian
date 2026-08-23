import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import { HotelGridPickerModal } from './HotelGridPickerModal'
import { LocationGridPickerModal } from './LocationGridPickerModal'

const noop = vi.fn()

describe('image eligibility in homepage pickers', () => {
  it('disables a location without a usable cover image', () => {
    render(
      <LocationGridPickerModal
        slotIndex={0}
        childLevel="neighborhood"
        candidatesQuery={
          {
            data: {
              docs: [
                {
                  id: 252,
                  level: 'neighborhood',
                  locationKey: 'peru|lima|barranco',
                  parentKey: 'peru|lima',
                  countryName: 'Peru',
                  cityName: 'Lima',
                  neighborhoodName: 'Barranco',
                  title: 'Barranco',
                  subtitle: 'Lima, Peru',
                  updatedAt: null,
                  coverImageUrl: null,
                  coverImageAlt: null
                }
              ],
              totalDocs: 1,
              totalPages: 1,
              page: 1,
              limit: 24
            },
            error: null,
            isLoading: false
          } as never
        }
        searchValue=""
        candidatePage={1}
        usedIds={new Set()}
        currentSlotId={null}
        onPick={noop}
        onClose={noop}
        setSearchValue={noop}
        setCandidatePage={noop}
      />
    )

    expect(screen.getByRole('button', { name: 'Needs image' })).toBeDisabled()
  })

  it('disables a place without a usable gallery image', () => {
    render(
      <HotelGridPickerModal
        slotIndex={0}
        candidatesQuery={
          {
            data: {
              docs: [
                {
                  id: 3,
                  title: 'Bridge of Sighs',
                  slug: null,
                  type: 'attraction',
                  priceLevel: null,
                  status: 'published',
                  updatedAt: null,
                  imageUrl: null,
                  location: 'Barranco'
                }
              ],
              totalDocs: 1,
              totalPages: 1,
              page: 1,
              limit: 24,
              allowDrafts: true
            },
            error: null,
            isFetching: false,
            isPending: false
          } as never
        }
        searchValue=""
        candidatePage={1}
        usedIds={new Set()}
        currentSlotId={null}
        onPick={noop}
        onClose={noop}
        setSearchValue={noop}
        setCandidatePage={noop}
        itemLabel="place"
      />
    )

    expect(screen.getByRole('button', { name: 'Needs image' })).toBeDisabled()
  })
})
