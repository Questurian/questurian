import { useEffect, useRef, useState } from 'react'
import type { StagedArticle } from '../../types'
import {
  buildArticleAiEditingClipboard,
  buildArticleMarkdownImport,
} from '../../features/editorial-stage-article/services/article-markdown-round-trip.service'

type ArticleMarkdownRoundTripControlsProps = {
  stagedArticle: StagedArticle
  onUpdateArticle: (updates: Partial<StagedArticle>) => void
}

async function writeClipboard(value: string): Promise<void> {
  if (navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(value)
    return
  }

  const fallback = document.createElement('textarea')
  fallback.value = value
  fallback.style.position = 'fixed'
  fallback.style.opacity = '0'
  document.body.appendChild(fallback)
  fallback.select()
  const copied = document.execCommand('copy')
  fallback.remove()
  if (!copied) throw new Error('Clipboard unavailable')
}

export function ArticleMarkdownRoundTripControls({
  stagedArticle,
  onUpdateArticle,
}: ArticleMarkdownRoundTripControlsProps) {
  const [isOpen, setIsOpen] = useState(false)
  const [pastedMarkdown, setPastedMarkdown] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [status, setStatus] = useState<string | null>(null)
  const statusTimerRef = useRef<number | null>(null)

  useEffect(() => () => {
    if (statusTimerRef.current !== null) window.clearTimeout(statusTimerRef.current)
  }, [])

  const showTemporaryStatus = (message: string) => {
    setStatus(message)
    if (statusTimerRef.current !== null) window.clearTimeout(statusTimerRef.current)
    statusTimerRef.current = window.setTimeout(() => setStatus(null), 3500)
  }

  const copyForAi = async () => {
    setError(null)
    try {
      await writeClipboard(buildArticleAiEditingClipboard(stagedArticle))
      showTemporaryStatus('Copied text-only Markdown + strict AI rules.')
    } catch {
      setError('Could not copy. Browser clipboard permission may be blocked.')
    }
  }

  const closeModal = () => {
    setIsOpen(false)
    setPastedMarkdown('')
    setError(null)
  }

  const applyMarkdown = () => {
    setError(null)
    try {
      const imported = buildArticleMarkdownImport(stagedArticle, pastedMarkdown)
      onUpdateArticle({
        title: imported.title,
        blocks: imported.nextBlocks,
        editorialBlocks: imported.nextEditorialBlocks,
        lexicalConverted: false,
      })
      closeModal()
      showTemporaryStatus(
        `Imported ${imported.nextBlocks.length - imported.preservedMediaCount} text blocks; kept ${imported.preservedMediaCount} image blocks and ${imported.nextEditorialBlocks.length} editorial blocks.`,
      )
    } catch (importError) {
      setError(importError instanceof Error ? importError.message : 'Markdown import failed.')
    }
  }

  return (
    <>
      <button type="button" className="stl-btn stl-btn-secondary" onClick={() => void copyForAi()}>
        Copy Markdown for AI
      </button>
      <button type="button" className="stl-btn stl-btn-secondary" onClick={() => {
        setError(null)
        setIsOpen(true)
      }}>
        Paste Edited Markdown
      </button>
      {status ? <span className="sab-markdown-round-trip-status" role="status">{status}</span> : null}
      {!isOpen && error ? <span className="sab-markdown-round-trip-error" role="alert">{error}</span> : null}

      {isOpen ? (
        <div className="stl-modal-overlay" onClick={(event) => {
          if (event.target === event.currentTarget) closeModal()
        }}>
          <div
            className="stl-modal sab-markdown-import-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="sab-markdown-import-title"
          >
            <div className="sab-markdown-import-header">
              <div>
                <h3 id="sab-markdown-import-title">Paste Edited Markdown</h3>
                <p>Replaces title + text. Existing images and editorial blocks stay in staged draft.</p>
              </div>
              <button type="button" className="stl-btn stl-btn-secondary" onClick={closeModal}>
                Close
              </button>
            </div>

            <details className="sab-markdown-import-rules">
              <summary>Accepted format</summary>
              <ul>
                <li>One H1 title first; H2 main sections; H3 subsections.</li>
                <li>Plain Markdown text only. Lists, links, emphasis, and blockquotes are accepted.</li>
                <li>No images, HTML, frontmatter, code fences, editorial syntax, or comments except QUESTURA markers.</li>
                <li>QUESTURA markers from copied prompt are removed automatically.</li>
              </ul>
            </details>

            <label className="stl-field sab-markdown-import-field">
              <span>Markdown</span>
              <textarea
                autoFocus
                rows={20}
                value={pastedMarkdown}
                onChange={(event) => setPastedMarkdown(event.target.value)}
                placeholder={'<!-- QUESTURA_ARTICLE_START -->\n# Article title\n\n## First section\n\nArticle text...\n<!-- QUESTURA_ARTICLE_END -->'}
              />
            </label>

            {error ? <p className="sab-markdown-import-error" role="alert">{error}</p> : null}

            <div className="stl-inline-actions sab-markdown-import-actions">
              <button type="button" className="stl-btn" onClick={applyMarkdown} disabled={!pastedMarkdown.trim()}>
                Replace Text from Markdown
              </button>
              <button type="button" className="stl-btn stl-btn-secondary" onClick={closeModal}>
                Cancel
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </>
  )
}
