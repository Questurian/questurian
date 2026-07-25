/**
 * Public surface of the staging feature.
 *
 * The article-list features (blogArticles, payloadArticles) and the pipeline
 * pages compose the staging shell, so its API, shared types, the stage builder,
 * and the local-draft services are exposed here rather than deep-imported.
 *
 * Nothing that imports blogArticles or payloadArticles may be re-exported here —
 * staging has no inbound dependency on either, and that must stay true to keep
 * this barrel cycle-free.
 */
export * from './api'
export * from './types'

export { StandardArticleStageBuilder } from './components/StandardArticleStageBuilder'

export * from './features/editorial-stage-article/services/editorial-stage-storage.service'
export * from './features/editorial-stage-article/services/migrate-local-drafts.service'
export * from './features/editorial-stage-article/services/payload-article-import.service'
