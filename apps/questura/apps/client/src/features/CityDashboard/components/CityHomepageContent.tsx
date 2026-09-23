import { createElement } from 'react'

import { getHomepageBlockLayout } from '../lib/blockLayoutRegistry'
import type { CityHomepageContentProps } from '../types'

function getBlockKey(block: CityHomepageContentProps['pageBlocks'][number], index: number): string {
  return 'id' in block && typeof block.id === 'string'
    ? block.id
    : `${block.blockType}-${index}`
}

export function CityHomepageContent({ location = null, pageBlocks }: CityHomepageContentProps) {
  const renderedBlocks = pageBlocks
    .map((block, index) => {
      const layout = getHomepageBlockLayout(block)

      if (!layout) {
        console.warn(
          `[CityHomepageContent] No client layout registered for homepage block "${block.blockType}".`,
        )
        return null
      }

      const { Component } = layout

      return createElement(Component, {
        key: getBlockKey(block, index),
        block,
        location,
        blockIndex: index,
      })
    })
    .filter(Boolean)

  if (renderedBlocks.length === 0) {
    return null
  }

  // The page's one <h1>. A location homepage is a wall of blocks with no
  // reader-facing title of its own -- the city name lives in the URL and the
  // browser tab, not on the page -- so it used to borrow the navbar wordmark
  // for its top-level heading. It is visually hidden rather than drawn,
  // because nothing in the design has a slot for it: the point is that a
  // reader arriving by heading lands on "Lima, Peru" and not on "Questurian".
  const heading = location
    ? createElement('h1', { className: 'sr-only', key: '__page-heading' }, location.label)
    : null

  return createElement(
    'main',
    { className: 'bg-[#f5f0e8] text-[#1a1a1a]' },
    heading,
    renderedBlocks,
  )
}
