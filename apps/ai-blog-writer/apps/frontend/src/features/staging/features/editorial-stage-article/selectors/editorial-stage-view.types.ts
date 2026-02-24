import type { ComponentProps } from 'react'
import { EditorialTimelineList } from '../../../components/editorial-stage/EditorialTimelineList'
import { EditorialSidebar } from '../../../components/editorial-stage/EditorialSidebar'
import { FeaturedImageModal } from '../../../components/editorial-stage/FeaturedImageModal'
import { BlockImageModal } from '../../../components/editorial-stage/BlockImageModal'

export type PublishResult = { success: boolean; message: string } | null

export type TimelineListViewProps = ComponentProps<typeof EditorialTimelineList>
export type SidebarViewProps = ComponentProps<typeof EditorialSidebar>
export type FeaturedModalViewProps = ComponentProps<typeof FeaturedImageModal>
export type BlockModalViewProps = ComponentProps<typeof BlockImageModal>
