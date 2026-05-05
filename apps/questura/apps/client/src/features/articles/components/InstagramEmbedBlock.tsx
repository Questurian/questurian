'use client'

import type { JSX } from 'react'
import { useEffect, useMemo, useState } from 'react'

declare global {
  interface Window {
    instgrm?: { Embeds: { process: () => void } }
  }
}

/** Instagram paste often includes a trailing `<script>`; scripts ignored from innerHTML, so we strip and load embed.js ourselves. */
export function instagramBlockquoteFromPaste(html: string): string {
  const t = html.trim()
  const match = t.match(/<blockquote[\s\S]*?<\/blockquote>/i)
  if (match) {
    return match[0]
  }
  const scriptIdx = t.search(/<script\b/i)
  return scriptIdx === -1 ? t : t.slice(0, scriptIdx).trim()
}

/** Removes captioned mode so Instagram renders a shorter card; media still uses each post’s natural height (no fixed max-height on our side). */
function stripInstagramCaptionAttribute(blockquoteHtml: string): string {
  return blockquoteHtml.replace(/\sdata-instgrm-captioned(?:="[^"]*")?/gi, '')
}

type InstagramEmbedBlockProps = {
  embedCode: string
  className?: string
  /**
   * - `all` — pasted embed as-is. **Nothing is cropped by us**; height differs per post (reel / photo / carousel) — that’s Instagram’s layout.
   * - `hide` — same, but strip `data-instgrm-captioned` so the long caption block isn’t expanded. **Full media/card** at the height IG chooses for non-captioned embeds (best default for listicles).
   * - `clip` — optional **fixed** max-height + fade + “Show full post” (does not perfectly match every aspect ratio; use when you want a collapsed preview).
   */
  captionMode?: 'clip' | 'hide' | 'all'
}

export function InstagramEmbedBlock({
  embedCode,
  className,
  captionMode = 'all',
}: InstagramEmbedBlockProps): JSX.Element {
  const [expanded, setExpanded] = useState(false)

  const processedHtml = useMemo(() => {
    const bq = instagramBlockquoteFromPaste(embedCode)
    if (!bq) {
      return ''
    }
    if (captionMode === 'hide') {
      return stripInstagramCaptionAttribute(bq)
    }
    return bq
  }, [embedCode, captionMode])

  useEffect(() => {
    if (!processedHtml || typeof window === 'undefined') {
      return
    }

    const processEmbeds = (): void => {
      window.instgrm?.Embeds.process()
    }

    const scriptSrc = 'https://www.instagram.com/embed.js'

    if (window.instgrm) {
      queueMicrotask(processEmbeds)
      return
    }

    const existing = document.querySelector(
      `script[src="${scriptSrc}"]`,
    ) as HTMLScriptElement | null

    if (existing) {
      const onLoad = (): void => processEmbeds()
      existing.addEventListener('load', onLoad, { once: true })
      queueMicrotask(processEmbeds)
      return () => existing.removeEventListener('load', onLoad)
    }

    const script = document.createElement('script')
    script.src = scriptSrc
    script.async = true
    script.onload = () => processEmbeds()
    document.body.appendChild(script)
  }, [processedHtml])

  useEffect(() => {
    if (captionMode !== 'clip' || !processedHtml || typeof window === 'undefined') {
      return
    }
    const id = requestAnimationFrame(() => {
      window.instgrm?.Embeds.process()
    })
    return () => cancelAnimationFrame(id)
  }, [captionMode, expanded, processedHtml])

  if (!processedHtml) {
    return <div className={className} />
  }

  const showClipChrome = captionMode === 'clip'

  return (
    <div className={className}>
      <div
        className={
          showClipChrome && !expanded
            ? 'relative max-h-[min(22rem,58vw)] overflow-hidden rounded-sm max-[379px]:max-h-[min(19rem,64vw)]'
            : 'relative rounded-sm'
        }
      >
        <div
          className="min-w-0 [&_blockquote.instagram-media]:mx-auto"
          dangerouslySetInnerHTML={{ __html: processedHtml }}
        />
        {showClipChrome && !expanded ? (
          <div
            className="pointer-events-none absolute inset-x-0 bottom-0 h-14 bg-gradient-to-t from-[var(--background)] via-[var(--background)]/88 to-transparent"
            aria-hidden
          />
        ) : null}
      </div>
      {showClipChrome ? (
        <button
          type="button"
          onClick={() => setExpanded((e) => !e)}
          className="mt-2 text-left text-[12px] font-medium leading-tight text-[var(--terracotta)] underline decoration-[var(--terracotta)]/45 underline-offset-[3px] 380:text-[13px]"
        >
          {expanded ? 'Show less' : 'Show full post'}
        </button>
      ) : null}
    </div>
  )
}
