import { useState } from 'react'

import HomepageBlockDeleteTrigger from './HomepageBlockDeleteTrigger'
import HomepageBlockSectionTextFields from './HomepageBlockSectionTextFields'
import HomepageBlockSettingsModal from './HomepageBlockSettingsModal'
import {
  HOMEPAGE_PAGE_BLOCK_CONFIG,
  type NewsletterSignupBlockResponse
} from './pageBlocks'

export default function NewsletterSignupBlockEditor({
  block,
  blockIndex,
  onDeleteBlock,
  isDeletingBlock,
  deleteError,
  saveSectionHeading,
  saveSectionSubheading
}: {
  block: NewsletterSignupBlockResponse
  blockIndex: number
  onDeleteBlock: (blockId: string) => void
  isDeletingBlock: boolean
  deleteError: string | null
  saveSectionHeading: (value: string | null) => Promise<void>
  saveSectionSubheading: (value: string | null) => Promise<void>
}) {
  const [settingsOpen, setSettingsOpen] = useState(false)
  const blockConfig = HOMEPAGE_PAGE_BLOCK_CONFIG['newsletter-signup']

  const displayKicker = (
    block.sectionHeading?.trim() || 'Newsletter'
  ).toUpperCase()
  const displayHeadline =
    block.sectionSubheading?.trim() ||
    'Our best stories and perspectives — delivered to your inbox. (Placeholder — hook up signup later.)'

  return (
    <div className="hf-block-section">
      <div className="hf-block-header">
        <div className="hf-block-label">
          <span>Block {blockIndex + 1}</span>
          <span className="hf-block-type-tag">{blockConfig.label}</span>
        </div>
        <div className="hf-block-header-actions">
          <button
            type="button"
            className="hf-btn-icon hf-block-settings-gear"
            title="Section title and subheading for this block"
            aria-label="Block settings"
            onClick={() => setSettingsOpen(true)}
          >
            ⚙
          </button>
          <HomepageBlockDeleteTrigger
            blockId={block.id}
            blockIndex={blockIndex}
            blockLabel={blockConfig.label}
            onDeleteBlock={onDeleteBlock}
            isDeletingBlock={isDeletingBlock}
            deleteError={deleteError}
          />
        </div>
      </div>

      <HomepageBlockSettingsModal
        isOpen={settingsOpen}
        onClose={() => setSettingsOpen(false)}
        title="Newsletter block"
      >
        <p className="hf-block-settings-hint" style={{ marginTop: 0 }}>
          Optional labels below map to the small kicker and main headline in the
          preview. Leave blank to use the default placeholder copy.
        </p>
        <HomepageBlockSectionTextFields
          blockId={block.id}
          sectionHeading={block.sectionHeading}
          sectionSubheading={block.sectionSubheading}
          settingsOpen={settingsOpen}
          saveSectionHeading={saveSectionHeading}
          saveSectionSubheading={saveSectionSubheading}
        />
      </HomepageBlockSettingsModal>

      <div
        className="hf-newsletter-placeholder"
        aria-label="Newsletter section preview (placeholder)"
      >
        <div className="hf-newsletter-placeholder-inner">
          <div className="hf-newsletter-placeholder-copy">
            <p className="hf-newsletter-kicker">{displayKicker}</p>
            <p className="hf-newsletter-headline">{displayHeadline}</p>
            <div className="hf-newsletter-fake-form" aria-hidden>
              <div className="hf-newsletter-fake-input">Email address</div>
              <div className="hf-newsletter-fake-btn">Sign up</div>
            </div>
            <p className="hf-newsletter-muted">
              Terms, privacy, and real signup flow will ship with the public
              site — this is layout-only.
            </p>
          </div>
          <div className="hf-newsletter-visual" aria-hidden>
            <div className="hf-newsletter-visual-card">
              <span className="hf-newsletter-visual-logo">◇</span>
              <span className="hf-newsletter-visual-caption">Daily digest</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
