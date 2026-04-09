/* @vitest-environment jsdom */
import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import StageArticlePage from './StageArticlePage'

const capturedProps = vi.hoisted(() => ({
  current: null as Record<string, unknown> | null,
}))

vi.mock('../../staging/components/StandardArticleStageBuilder', () => ({
  StandardArticleStageBuilder: (props: Record<string, unknown>) => {
    capturedProps.current = props
    return <div>standard article stage builder</div>
  },
}))

describe('YouTube2Blog StageArticlePage', () => {
  it('renders the shared standard article stage builder with the youtube configuration', () => {
    render(<StageArticlePage />)

    expect(screen.getByText('standard article stage builder')).toBeInTheDocument()
    expect(capturedProps.current).toMatchObject({
      storageKey: 'youtube2blog_staged_articles_v2',
      featureLabel: 'YouTube2Blog',
      heroDescription: 'Step through setup, featured image selection, article content blocks, and SEO before saving drafts or publishing to Payload.',
      syncBehavior: 'draft-sync',
      routes: {
        stagePath: '/youtube2blog/stage',
        stageArticlePath: '/youtube2blog/stage-article',
        articlesPath: '/youtube2blog/articles',
      },
    })
  })
})
