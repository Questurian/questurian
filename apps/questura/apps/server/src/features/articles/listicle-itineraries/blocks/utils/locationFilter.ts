import type { FilterOptionsProps, Where } from 'payload'

export const createLocationFilter = (_: string) => {
  return ({ data }: FilterOptionsProps): Where => {
    const parentLocation = data?.location as string | undefined

    if (!parentLocation) {
      return {
        status: { equals: 'published' },
      } satisfies Where
    }

    return {
      and: [
        { location: { equals: parentLocation } },
        { status: { equals: 'published' } },
      ],
    }
  }
}
