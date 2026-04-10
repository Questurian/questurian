import HomepageFeaturedSlotEditor from './HomepageFeaturedSlotEditor'
import HomepageBlockDeleteTrigger from './HomepageBlockDeleteTrigger'
import {
  HOMEPAGE_PAGE_BLOCK_CONFIG,
  type ArticleCuratedHomepageBlockResponse,
} from './pageBlocks'
import { useHomepageFeaturedSlots, type CandidateParams } from './useHomepageFeaturedSlots'
import type {
  HomepageFeaturedCandidatesResponse,
  HomepageFeaturedItemRef,
  HomepageFeaturedSelection,
} from './types'

type Props = {
  block: ArticleCuratedHomepageBlockResponse
  blockIndex: number
  token: string | null
  canManage: boolean
  selectionQueryKey: unknown[]
  saveSelection: (
    token: string,
    items: HomepageFeaturedItemRef[],
  ) => Promise<HomepageFeaturedSelection>
  fetchCandidates: (
    token: string,
    params: CandidateParams,
  ) => Promise<HomepageFeaturedCandidatesResponse>
  onDeleteBlock: (blockId: string) => void
  isDeletingBlock: boolean
  deleteError: string | null
}

export default function CuratedHomepageBlockEditor({
  block,
  blockIndex,
  token,
  canManage,
  selectionQueryKey,
  saveSelection,
  fetchCandidates,
  onDeleteBlock,
  isDeletingBlock,
  deleteError,
}: Props) {
  const slotEditorState = useHomepageFeaturedSlots({
    token,
    canManage,
    fetchSelection: () => Promise.resolve(block.selection),
    saveSelection,
    fetchCandidates,
    selectionQueryKey,
  })

  const totalSlots = block.selection.totalSlots
  const blockConfig = HOMEPAGE_PAGE_BLOCK_CONFIG[block.blockType]

  return (
    <div className="hf-block-section">
      <div className="hf-block-header">
        <div className="hf-block-label">
          <span>Block {blockIndex + 1}</span>
          <span className="hf-block-type-tag">{blockConfig.label} · {totalSlots} slots</span>
        </div>
        <HomepageBlockDeleteTrigger
          blockId={block.id}
          blockIndex={blockIndex}
          blockLabel={blockConfig.label}
          onDeleteBlock={onDeleteBlock}
          isDeletingBlock={isDeletingBlock}
          deleteError={deleteError}
        />
      </div>
      <div className="hf-block-content">
        <HomepageFeaturedSlotEditor
          pageTitle=""
          pageSubtitle={blockConfig.description}
          slotEditorState={slotEditorState}
          compact
          variant={block.blockType}
        />
      </div>
    </div>
  )
}
