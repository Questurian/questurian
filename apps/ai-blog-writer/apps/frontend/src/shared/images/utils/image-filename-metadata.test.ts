import { describe, expect, it } from 'vitest'
import {
  generateVariantFileName,
  parsePhotographerFromFilename,
  parseSeriesSlugFromFilename
} from './image-filename-metadata'

describe('image filename metadata', () => {
  it.each([
    ['questurian_night-life-57.jpg', 'Questurian'],
    ['erik-odiin_airport-1.jpg', 'Erik Odiin'],
    ['mARIA_golden-hour-12.JPG', 'Maria']
  ])('parses photographer credit from %s', (filename, expected) => {
    expect(parsePhotographerFromFilename(filename)).toBe(expected)
  })

  it.each([
    ['questurian_night-life-57.jpg', 'night-life'],
    ['erik-odiin_airport-1.jpg', 'airport'],
    ['maria_golden-hour-12.webp', 'golden-hour']
  ])('parses a numbered series slug from %s', (filename, expected) => {
    expect(parseSeriesSlugFromFilename(filename)).toBe(expected)
  })

  it.each([
    ['juan-garcia-1.jpg', null, null],
    ['_night-life-57.jpg', null, 'night-life'],
    ['questurian_.jpg', 'Questurian', null],
    ['questurian_night-life.jpg', 'Questurian', null]
  ])(
    'preserves partial metadata behavior for %s',
    (filename, photographer, series) => {
      expect(parsePhotographerFromFilename(filename)).toBe(photographer)
      expect(parseSeriesSlugFromFilename(filename)).toBe(series)
    }
  )

  it('normalizes generated variant filenames and honors a prefix', () => {
    expect(generateVariantFileName('Crème Brûlée.JPG', 'open_graph')).toBe(
      'creme-brulee_open_graph.webp'
    )
    expect(
      generateVariantFileName(
        'ignored.jpg',
        'thumbnail',
        '  Summer in São Paulo  '
      )
    ).toBe('summer-in-sao-paulo_thumbnail.webp')
    expect(generateVariantFileName('***.jpg', 'square')).toBe(
      'image_square.webp'
    )
    expect(generateVariantFileName('folder.name/photo', 'wide')).toBe(
      'folder-name-photo_wide.webp'
    )
  })
})
