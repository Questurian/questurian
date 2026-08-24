import type { TimelineListViewProps } from '../../features/editorial-stage-article/selectors'
import type { StagedArticle } from '../../types'
import { EditorialTimelineList } from '../editorial-stage/EditorialTimelineList'
import { ArticleMarkdownRoundTripControls } from './ArticleMarkdownRoundTripControls'

type StandardArticleContentPanelProps = {
  stagedArticle: StagedArticle
  timelineListProps: TimelineListViewProps
  isSynced: boolean
  isStep3Locked: boolean
  onUpdateArticle: (updates: Partial<StagedArticle>) => void
  onContinue: () => void
  onResetToOriginalBlocks: () => void
  onOpenDeepExpand: () => void
}

export function StandardArticleContentPanel({
  stagedArticle,
  timelineListProps,
  isSynced,
  isStep3Locked,
  onUpdateArticle,
  onContinue,
  onResetToOriginalBlocks,
  onOpenDeepExpand,
}: StandardArticleContentPanelProps) {
  return (
    <section className="stl-panel sab-stage-panel sab-stage-panel-content">
      <div className="stl-panel-header">
        <h2>{!isSynced ? <span className="stl-kicker">Step 3</span> : null} Content Blocks</h2>
        <div className="stl-inline-actions">
          <ArticleMarkdownRoundTripControls
            stagedArticle={stagedArticle}
            onUpdateArticle={onUpdateArticle}
          />
          <button type="button" className="stl-btn stl-btn-secondary" onClick={onResetToOriginalBlocks}>
            Reset to Original
          </button>
          <button type="button" className="stl-btn stl-btn-secondary" onClick={onOpenDeepExpand}>
            Deep Expand
          </button>
          {!isSynced ? (
            isStep3Locked ? (
              stagedArticle.step3_in_update_mode ? (
                <>
                  <button
                    type="button"
                    className="stl-btn stl-btn-secondary"
                    onClick={() => onUpdateArticle({ step3_in_update_mode: false })}
                  >
                    Cancel
                  </button>
                  <button type="button" className="stl-btn" onClick={onContinue}>
                    Save Step 3
                  </button>
                </>
              ) : (
                <button
                  type="button"
                  className="stl-btn stl-btn-secondary"
                  onClick={() => onUpdateArticle({ step3_in_update_mode: true })}
                >
                  Update Step 3
                </button>
              )
            ) : (
              <button type="button" className="stl-btn" onClick={onContinue}>
                Continue to Step 4
              </button>
            )
          ) : null}
        </div>
      </div>

      <div className="sab-stage-content-shell">
        <EditorialTimelineList {...timelineListProps} />
      </div>
    </section>
  )
}
