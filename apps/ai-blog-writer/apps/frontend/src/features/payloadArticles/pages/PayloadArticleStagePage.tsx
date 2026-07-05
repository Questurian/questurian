import { useEffect, useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { useAuth } from '../../auth'
import { StandardArticleStageBuilder } from '../../staging/components/StandardArticleStageBuilder'
import {
  convertLexicalToMarkdown,
  convertMarkdownToLexical,
  createArticle,
  fetchExternalImageSource,
  fetchLocations,
  fetchMediaAssets,
  generateSeoMetadataWithAi,
  getArticleById,
  importExternalImage,
  rewriteBlockWithAi,
  searchPexelsImages,
  searchUnsplashImages,
  updateArticle,
} from '../../staging/api'
import {
  buildStagedArticleFromPayloadDoc,
  type PayloadArticleDetail,
} from '../../staging/features/editorial-stage-article/services/payload-article-import.service'
import {
  getAllStagedArticles,
  upsertStagedArticle,
} from '../../staging/features/editorial-stage-article/services/editorial-stage-storage.service'
import {
  PAYLOAD_ARTICLES_PATH,
  PAYLOAD_ARTICLES_STAGE_PATH,
  buildPayloadArticleDraftUrl,
} from '../../blogArticles/utils/payload-article-links'
import { PAYLOAD_ARTICLES_STORAGE_KEY } from '../constants'

// This editor works on Payload documents directly; there is no pipeline run
// behind a draft, so the run-scoped APIs are inert.
const noopMarkArticleSynced = async (runId: string, payloadArticleId: number) => ({
  message: 'Payload-only draft; no pipeline run to mark',
  run_id: runId,
  payload_article_id: payloadArticleId,
})

const noopFetchResult = async (): Promise<{ markdown: string }> => {
  throw new Error('Payload articles are imported from Payload, not from a pipeline run')
}

// The rewrite backend only accepts editor-assist models; drop anything else so
// the wider editor model union from the builder still typechecks.
const rewriteBlockWithAssistModel: Parameters<typeof StandardArticleStageBuilder>[0]['api']['rewriteBlockWithAi'] =
  ({ modelName, ...rest }) =>
    rewriteBlockWithAi({
      ...rest,
      modelName: modelName === 'claude-opus-4-8' ? modelName : undefined,
    })

function PayloadArticleImport({ payloadId }: { payloadId: number }) {
  const { token } = useAuth()
  const navigate = useNavigate()
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!token || !Number.isFinite(payloadId) || payloadId <= 0) return
    let isCancelled = false

    const importArticle = async () => {
      try {
        // Resume an existing draft of this document instead of re-importing,
        // so in-progress local edits are never clobbered.
        const existingDrafts = await getAllStagedArticles(PAYLOAD_ARTICLES_STORAGE_KEY)
        const existing = existingDrafts.find((draft) => draft.payloadArticleId === payloadId)
        if (existing) {
          if (!isCancelled) navigate(buildPayloadArticleDraftUrl(existing.id), { replace: true })
          return
        }

        const doc = await getArticleById(payloadId, token) as PayloadArticleDetail
        const stagedArticle = await buildStagedArticleFromPayloadDoc({
          doc,
          convertLexicalToMarkdown,
        })
        const saved = await upsertStagedArticle(PAYLOAD_ARTICLES_STORAGE_KEY, stagedArticle)
        if (!isCancelled) navigate(buildPayloadArticleDraftUrl(saved.id), { replace: true })
      } catch (err) {
        if (!isCancelled) {
          setError(err instanceof Error ? err.message : 'Failed to import article from Payload')
        }
      }
    }

    void importArticle()
    return () => {
      isCancelled = true
    }
  }, [token, payloadId, navigate])

  return (
    <div className="stl-page">
      <section className="stl-panel">
        {!token ? (
          <p className="stl-placeholder">Sign in to edit Payload articles.</p>
        ) : error ? (
          <>
            <p className="stl-error">Failed to load article #{payloadId} from Payload: {error}</p>
            <Link to={PAYLOAD_ARTICLES_PATH} className="stl-link">Back to Payload Articles</Link>
          </>
        ) : (
          <p className="stl-placeholder">Importing article #{payloadId} from Payload...</p>
        )}
      </section>
    </div>
  )
}

export default function PayloadArticleStagePage() {
  const [searchParams] = useSearchParams()
  const payloadIdParam = searchParams.get('payloadId')

  if (payloadIdParam) {
    return <PayloadArticleImport payloadId={Number(payloadIdParam)} />
  }

  return (
    <StandardArticleStageBuilder
      storageKey={PAYLOAD_ARTICLES_STORAGE_KEY}
      routes={{
        stagePath: PAYLOAD_ARTICLES_PATH,
        stageArticlePath: PAYLOAD_ARTICLES_STAGE_PATH,
        articlesPath: PAYLOAD_ARTICLES_PATH,
      }}
      api={{
        fetchLocations,
        fetchMediaAssets,
        createArticle,
        updateArticle,
        getArticleById,
        convertMarkdownToLexical,
        fetchExternalImageSource,
        fetchResult: noopFetchResult,
        importExternalImage,
        markArticleSynced: noopMarkArticleSynced,
        searchPexelsImages,
        searchUnsplashImages,
        rewriteBlockWithAi: rewriteBlockWithAssistModel,
        generateSeoMetadataWithAi,
      }}
      featureLabel="Payload"
      heroEyebrow="Payload Article Editor"
      heroDescription="Edit an article that lives in Payload CMS — any pipeline, or none. Changes save back to the same Payload document."
      syncBehavior="draft-sync"
      backToStageLabel="Back to Payload Articles"
    />
  )
}
