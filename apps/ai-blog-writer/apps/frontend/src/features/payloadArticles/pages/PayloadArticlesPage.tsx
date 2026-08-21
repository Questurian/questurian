import { useQuery } from '@tanstack/react-query'
import { useAuth } from '../../auth'
import { fetchPayloadArticles } from '../../staging'
import {
  buildPayloadArticleDraftUrl,
  LocalDraftsTable,
  PayloadDocumentsTable,
  useLocalStagedDrafts,
} from '../../blogArticles'
import { PAYLOAD_ARTICLES_STORAGE_KEY } from '../constants'

export default function PayloadArticlesPage() {
  const { user, isAuthenticated } = useAuth()
  const { localDrafts, discardLocalDraft, clearAllLocalDrafts } = useLocalStagedDrafts(
    PAYLOAD_ARTICLES_STORAGE_KEY,
  )

  const payloadDocsQuery = useQuery({
    queryKey: ['payload-articles', user?.id ?? 'anonymous'],
    queryFn: () => fetchPayloadArticles(),
  })
  const payloadDocs = payloadDocsQuery.data ?? []

  const handleClearAllLocalDrafts = () => {
    if (localDrafts.length === 0) return
    const confirmed = window.confirm(
      `Discard all ${localDrafts.length} local draft${localDrafts.length === 1 ? '' : 's'}? This cannot be undone.`,
    )
    if (!confirmed) return
    void clearAllLocalDrafts()
  }

  return (
    <div className="stl-page">
      <header className="stl-hero">
        <div>
          <p className="stl-eyebrow">Questurian Studio</p>
          <h1>Payload Articles</h1>
          <p className="stl-lede">
            Every article in Payload CMS, from any pipeline or created by hand — edit them all with the same builder.
          </p>
        </div>
      </header>

      <main>
        <LocalDraftsTable
          rows={localDrafts}
          buildDraftUrl={buildPayloadArticleDraftUrl}
          onDiscard={discardLocalDraft}
          onClearAll={handleClearAllLocalDrafts}
        />

        <PayloadDocumentsTable
          docs={payloadDocs}
          localDrafts={localDrafts}
          buildDraftUrl={buildPayloadArticleDraftUrl}
          isLoading={payloadDocsQuery.isLoading}
          loadErrorMessage={
            payloadDocsQuery.isError
              ? (payloadDocsQuery.error instanceof Error ? payloadDocsQuery.error.message : 'Unknown error')
              : null
          }
          isSignedIn={isAuthenticated}
        />
      </main>
    </div>
  )
}
