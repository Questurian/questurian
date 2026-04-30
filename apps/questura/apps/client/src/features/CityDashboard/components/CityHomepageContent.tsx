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
        return null
      }

      const { Component } = layout

      return createElement(Component, { key: getBlockKey(block, index), block, location })
    })
    .filter(Boolean)

  if (renderedBlocks.length === 0) {
    return null
  }

  return createElement('main', { className: 'bg-[#f5f0e8] text-[#1a1a1a]' }, renderedBlocks)
}
