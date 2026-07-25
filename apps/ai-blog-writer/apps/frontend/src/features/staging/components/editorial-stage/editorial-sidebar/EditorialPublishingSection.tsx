import payloadLogoUrl from '../../../../../assets/payload-logo.svg?url'
import type { EditorialSidebarPublishingState } from './editorial-sidebar-publishing-state'

type PublishResult = { success: boolean; message: string } | null

type EditorialPublishingSectionProps = {
  state: EditorialSidebarPublishingState
  isPublishing: boolean
  allFieldsFilled: boolean
  missingPublishFields: string[]
  editorialBlockingMessages: string[]
  publishResult: PublishResult
  canManagePublished: boolean
  role: string | null
  onPublish: (targetStatus: 'draft' | 'published') => void
}

export function EditorialPublishingSection({
  state,
  isPublishing,
  allFieldsFilled,
  missingPublishFields,
  editorialBlockingMessages,
  publishResult,
  canManagePublished,
  role,
  onPublish,
}: EditorialPublishingSectionProps) {
  return (
    <div className="stage-article-sidebar-section stage-article-sidebar-publish">
      {state.payloadStatusLabel ? (
        <div className="stage-article-published-notice">{state.payloadStatusLabel}</div>
      ) : null}

      {!state.isPublished && (
        <button
          onClick={() => onPublish('draft')}
          disabled={isPublishing || !state.canSaveDraft}
          className="stage-article-publish-btn payload-action-btn"
        >
          <PayloadIcon />
          {isPublishing ? 'Saving...' :
           !allFieldsFilled ? 'Complete fields below' :
           state.hasBlockingEditorial ? 'Fix editorial blocks' :
           state.isLinkedDraft ? 'Update Draft in Payload' :
           'Save Draft to Payload'}
        </button>
      )}

      <button
        onClick={() => onPublish('published')}
        disabled={isPublishing || !state.canPublish || !canManagePublished}
        className="stage-article-publish-btn payload-action-btn"
      >
        <PayloadIcon />
        {isPublishing ? 'Publishing...' :
         !canManagePublished ? (state.isPublished ? 'Update Published' : 'Publish') :
         !state.canSaveDraft ? 'Complete draft first' :
         state.isPublished ? 'Update Published' :
         'Publish'}
      </button>

      {!canManagePublished ? (
        <p className="stage-article-publish-checklist-more">
          {state.isPublished
            ? `Updating a published article requires an editor or admin role (you are signed in as ${role ?? 'unknown'}).`
            : `Publishing requires an editor or admin role (you are signed in as ${role ?? 'unknown'}).`}
        </p>
      ) : null}

      {state.shouldSetUpUrlsLater ? (
        <p className="stage-article-publish-checklist-more">Set-up urls later</p>
      ) : null}

      {(!state.canSaveDraft || (canManagePublished && !state.canPublish)) && (
        <PublishChecklist
          state={state}
          missingPublishFields={missingPublishFields}
          editorialBlockingMessages={editorialBlockingMessages}
          canManagePublished={canManagePublished}
        />
      )}

      {publishResult && (
        <div className={`stage-article-result ${publishResult.success ? 'success' : 'error'}`}>
          {publishResult.message}
        </div>
      )}
    </div>
  )
}

function PayloadIcon() {
  return (
    <img
      src={payloadLogoUrl}
      alt=""
      aria-hidden="true"
      className="payload-action-btn-icon"
    />
  )
}

type PublishChecklistProps = Pick<
  EditorialPublishingSectionProps,
  'missingPublishFields' | 'editorialBlockingMessages' | 'canManagePublished'
> & {
  state: EditorialSidebarPublishingState
}

function PublishChecklist({
  state,
  missingPublishFields,
  editorialBlockingMessages,
  canManagePublished,
}: PublishChecklistProps) {
  return (
    <div className="stage-article-publish-checklist">
      {!state.canSaveDraft && missingPublishFields.length > 0 && (
        <>
          <p className="stage-article-publish-checklist-title">Missing required fields:</p>
          <ul className="stage-article-publish-checklist-list">
            {missingPublishFields.map((field) => <li key={field}>{field}</li>)}
          </ul>
        </>
      )}
      {state.hasBlockingEditorial && (
        <>
          <p className="stage-article-publish-checklist-title">
            Fix editorial blocks before publish:
          </p>
          <ul className="stage-article-publish-checklist-list">
            {editorialBlockingMessages.slice(0, 3).map((message, index) => (
              <li key={`${message}-${index}`}>{message}</li>
            ))}
          </ul>
          {editorialBlockingMessages.length > 3 && (
            <p className="stage-article-publish-checklist-more">
              +{editorialBlockingMessages.length - 3} more block issues
            </p>
          )}
        </>
      )}
      {canManagePublished && !state.canPublish && state.publishBlockedReasons.length > 0 && (
        <>
          <p className="stage-article-publish-checklist-title">Publish requirements:</p>
          <ul className="stage-article-publish-checklist-list">
            {state.publishBlockedReasons.map((reason, index) => (
              <li key={`${reason}-${index}`}>{reason}</li>
            ))}
          </ul>
        </>
      )}
    </div>
  )
}
