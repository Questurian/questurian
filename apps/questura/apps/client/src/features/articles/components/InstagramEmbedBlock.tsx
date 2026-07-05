'use client'

import type { JSX } from 'react'
import { useEffect, useMemo, useRef, useState } from 'react'
import { preconnect } from 'react-dom'

declare global {
  interface Window {
    instgrm?: { Embeds: { process: () => void } }
    __igEmbedScriptPromise?: Promise<void>
  }
}

const SCRIPT_SRC = 'https://www.instagram.com/embed.js'
const REVEAL_FALLBACK_MS = 8000
const LAZY_ROOT_MARGIN = '800px 0px'
const SKELETON_MIN_HEIGHT = 600

function loadInstagramScript(): Promise<void> {
  if (typeof window === 'undefined') {
    return Promise.resolve()
  }
  if (window.instgrm) {
    return Promise.resolve()
  }
  if (window.__igEmbedScriptPromise) {
    return window.__igEmbedScriptPromise
  }

  window.__igEmbedScriptPromise = new Promise<void>((resolve) => {
    const finish = (): void => resolve()
    const existing = document.querySelector(
      `script[src="${SCRIPT_SRC}"]`,
    ) as HTMLScriptElement | null

    if (existing) {
      if (window.instgrm) {
        finish()
        return
      }
      existing.addEventListener('load', finish, { once: true })
      queueMicrotask(() => {
        if (window.instgrm) finish()
      })
      return
    }

    const script = document.createElement('script')
    script.src = SCRIPT_SRC
    script.async = true
    script.onload = finish
    document.body.appendChild(script)
  })

  return window.__igEmbedScriptPromise
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
  /**
   * Mount and process the embed on page load instead of waiting for scroll,
   * and show Instagram's own blockquote card immediately (no skeleton overlay).
   */
  eager?: boolean
}

export function InstagramEmbedBlock({
  embedCode,
  className,
  captionMode = 'all',
  eager = false,
}: InstagramEmbedBlockProps): JSX.Element {
  if (eager) {
    preconnect('https://www.instagram.com')
  }
  const [shouldMount, setShouldMount] = useState(eager)
  const [ready, setReady] = useState(false)
  const [expanded, setExpanded] = useState(false)
  const wrapperRef = useRef<HTMLDivElement | null>(null)
  const hostRef = useRef<HTMLDivElement | null>(null)

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
    if (!processedHtml || shouldMount) {
      return
    }
    const el = wrapperRef.current
    if (!el || typeof IntersectionObserver === 'undefined') {
      setShouldMount(true)
      return
    }
    const io = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            setShouldMount(true)
            io.disconnect()
            break
          }
        }
      },
      { rootMargin: LAZY_ROOT_MARGIN },
    )
    io.observe(el)
    return () => io.disconnect()
  }, [processedHtml, shouldMount])

  useEffect(() => {
    if (!shouldMount || !processedHtml || typeof window === 'undefined') {
      return
    }
    const host = hostRef.current
    if (!host) {
      return
    }

    let revealed = false
    const reveal = (): void => {
      if (revealed) return
      revealed = true
      setReady(true)
    }

    const fallbackTimer = window.setTimeout(reveal, REVEAL_FALLBACK_MS)

    const watchedIframes = new WeakSet<HTMLIFrameElement>()
    const watchIframe = (iframe: HTMLIFrameElement): void => {
      if (watchedIframes.has(iframe)) return
      watchedIframes.add(iframe)
      const onLoad = (): void => {
        requestAnimationFrame(() => requestAnimationFrame(reveal))
      }
      iframe.addEventListener('load', onLoad, { once: true })
    }

    const checkForIframe = (): void => {
      const iframe = host.querySelector('iframe')
      if (iframe instanceof HTMLIFrameElement) {
        watchIframe(iframe)
      }
    }

    checkForIframe()
    const mo = new MutationObserver(checkForIframe)
    mo.observe(host, { childList: true, subtree: true })

    let cancelled = false
    void loadInstagramScript().then(() => {
      if (cancelled) return
      window.instgrm?.Embeds.process()
    })

    return () => {
      cancelled = true
      mo.disconnect()
      window.clearTimeout(fallbackTimer)
    }
  }, [shouldMount, processedHtml])

  useEffect(() => {
    if (captionMode !== 'clip' || !shouldMount || !ready) {
      return
    }
    const id = requestAnimationFrame(() => {
      window.instgrm?.Embeds.process()
    })
    return () => cancelAnimationFrame(id)
  }, [captionMode, expanded, ready, shouldMount])

  if (!processedHtml) {
    return <div className={className} />
  }

  const showClipChrome = captionMode === 'clip'
  // Eager mode shows Instagram's own blockquote card immediately; no hidden
  // opacity phase and no skeleton overlay while the iframe hydrates.
  const revealNow = eager || ready

  return (
    <div ref={wrapperRef} className={className}>
      <div
        className={
          showClipChrome && !expanded
            ? 'relative max-h-[min(22rem,58vw)] overflow-hidden rounded-sm max-[379px]:max-h-[min(19rem,64vw)]'
            : 'relative rounded-sm'
        }
      >
        <div
          ref={hostRef}
          className={`min-w-0 [&_blockquote.instagram-media]:mx-auto transition-opacity duration-200 ${
            revealNow ? 'opacity-100' : 'opacity-0'
          }`}
          style={!ready ? { minHeight: SKELETON_MIN_HEIGHT } : undefined}
          dangerouslySetInnerHTML={
            shouldMount ? { __html: processedHtml } : undefined
          }
        />
        {!revealNow ? (
          <div
            className="pointer-events-none absolute inset-0 animate-pulse rounded-sm bg-foreground/[0.06]"
            aria-hidden
          />
        ) : null}
        {showClipChrome && ready && !expanded ? (
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
          disabled={!ready}
          className="mt-2 text-left text-[12px] font-medium leading-tight text-[var(--terracotta)] underline decoration-[var(--terracotta)]/45 underline-offset-[3px] disabled:opacity-50 380:text-[13px]"
        >
          {expanded ? 'Show less' : 'Show full post'}
        </button>
      ) : null}
    </div>
  )
}
