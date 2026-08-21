import type { JSX } from 'react'

import type { CityHomepageArticleBlock, HomepageBlockLayoutProps } from '../../../types'
import { FeaturedArticleOneArticlePreview } from '../featured-article/FeaturedArticleOneArticlePreview'

export function FeaturedCreatorArticlePreview(
  props: HomepageBlockLayoutProps<CityHomepageArticleBlock>,
): JSX.Element | null {
  return <FeaturedArticleOneArticlePreview {...props} showAuthorAvatar />
}
