import { describe, expect, it } from 'vitest'
import { SingleTypeListicles } from './SingleTypeListicles'
import { clearStaleSocialImagesOnFeaturedImageChange } from './hooks/clearStaleSocialImages'
import { validateSingleTypeListicle } from './hooks/validateSingleTypeListicle'

async function runBeforeChange(
  data: Record<string, unknown>,
  originalDoc: Record<string, unknown>,
) {
  return clearStaleSocialImagesOnFeaturedImageChange({
    data,
    originalDoc,
    operation: 'update',
    req: {},
  } as never)
}

function buildOriginalDoc(overrides: Record<string, unknown> = {}) {
  return {
    id: 12,
    header: {
      featuredImage: 101,
    },
    seoSection: {
      seoTitle: 'Best Lima Restaurants',
      openGraph: {
        title: 'Best Lima Restaurants',
        imageUrl: 'https://cdn.example.com/old-og.webp',
        url: 'https://example.com/best-lima-restaurants',
      },
      twitterCard: {
        card: 'summary_large_image',
        imageUrl: 'https://cdn.example.com/old-twitter.webp',
      },
      structuredData: {
        '@type': 'Article',
        headline: 'Best Lima Restaurants',
        image: 'https://cdn.example.com/old-og.webp',
      },
    },
    ...overrides,
  }
}

describe('SingleTypeListicles featured image SEO sync', () => {
  it('clears stale OG, Twitter, and matching structured-data images when featured image changes', async () => {
    const data = {
      header: {
        featuredImage: 202,
      },
    }

    const result = await runBeforeChange(data, buildOriginalDoc()) as Record<string, unknown>
    const seoSection = result.seoSection as Record<string, unknown>
    const openGraph = seoSection.openGraph as Record<string, unknown>
    const twitterCard = seoSection.twitterCard as Record<string, unknown>
    const structuredData = seoSection.structuredData as Record<string, unknown>

    expect(openGraph.imageUrl).toBeNull()
    expect(twitterCard.imageUrl).toBeNull()
    expect(structuredData.image).toBeUndefined()
    expect(seoSection.seoTitle).toBe('Best Lima Restaurants')
  })

  it('preserves custom social image URLs changed in the same save', async () => {
    const data = {
      header: {
        featuredImage: 202,
      },
      seoSection: {
        openGraph: {
          imageUrl: 'https://cdn.example.com/custom-og.webp',
        },
        twitterCard: {
          imageUrl: 'https://cdn.example.com/custom-twitter.webp',
        },
        structuredData: {
          '@type': 'Article',
          image: 'https://cdn.example.com/custom-og.webp',
        },
      },
    }

    const result = await runBeforeChange(data, buildOriginalDoc()) as Record<string, unknown>
    const seoSection = result.seoSection as Record<string, unknown>
    const openGraph = seoSection.openGraph as Record<string, unknown>
    const twitterCard = seoSection.twitterCard as Record<string, unknown>
    const structuredData = seoSection.structuredData as Record<string, unknown>

    expect(openGraph.imageUrl).toBe('https://cdn.example.com/custom-og.webp')
    expect(twitterCard.imageUrl).toBe('https://cdn.example.com/custom-twitter.webp')
    expect(structuredData.image).toBe('https://cdn.example.com/custom-og.webp')
  })

  it('leaves structured-data images that do not match the stale social image URL', async () => {
    const data = {
      header: {
        featuredImage: 202,
      },
      seoSection: {
        structuredData: {
          '@type': 'Article',
          image: 'https://cdn.example.com/custom-schema-image.webp',
        },
      },
    }

    const result = await runBeforeChange(data, buildOriginalDoc()) as Record<string, unknown>
    const seoSection = result.seoSection as Record<string, unknown>
    const structuredData = seoSection.structuredData as Record<string, unknown>

    expect(structuredData.image).toBe('https://cdn.example.com/custom-schema-image.webp')
  })

  it('does not touch SEO when the featured image is unchanged', async () => {
    const data = {
      header: {
        featuredImage: 101,
      },
    }

    const result = await runBeforeChange(data, buildOriginalDoc()) as Record<string, unknown>

    expect(result).toBe(data)
    expect(result.seoSection).toBeUndefined()
  })
})

async function runBeforeValidate(data: Record<string, unknown>) {
  return validateSingleTypeListicle({
    data,
    operation: 'update',
    req: {
      payload: {
        findByID: async ({ id }: { id: string | number }) => ({
          id,
          gallery: [{ image: 1 }],
        }),
      },
    },
  } as never)
}

function buildVenueRow(rowId: string, venueId: number) {
  return {
    id: rowId,
    blockType: 'data-dining',
    item: venueId,
    mediaMode: 'photos',
    selectedPhotos: [1],
  }
}

describe('SingleTypeListicles hook wiring', () => {
  it('registers the extracted SEO and validation hooks', () => {
    expect(SingleTypeListicles.hooks?.beforeChange).toContain(
      clearStaleSocialImagesOnFeaturedImageChange,
    )
    expect(SingleTypeListicles.hooks?.beforeValidate).toContain(validateSingleTypeListicle)
  })
})

describe('SingleTypeListicles duplicate venue guard', () => {
  it('rejects a list where two rows reference the same source venue', async () => {
    await expect(
      runBeforeValidate({
        step1_complete: true,
        targetItemCount: 10,
        items: [buildVenueRow('row-a', 296), buildVenueRow('row-b', 296)],
      }),
    ).rejects.toThrow('Item 2 references the same dining entry as item 1')
  })

  it('accepts a list where every row references a distinct venue', async () => {
    await expect(
      runBeforeValidate({
        step1_complete: true,
        targetItemCount: 10,
        items: [buildVenueRow('row-a', 296), buildVenueRow('row-b', 304)],
      }),
    ).resolves.toBeTruthy()
  })
})
