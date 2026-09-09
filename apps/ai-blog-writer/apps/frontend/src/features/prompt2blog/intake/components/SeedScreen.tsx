import { useState } from 'react'

/**
 * One line, one box.
 *
 * No title field and no location field. A form is a literacy test: it only
 * works if you already know what belongs in each box. Everything the old form
 * asked for is either looked up or asked about in plain English, one question
 * at a time.
 *
 * The second way in sits underneath, for an article that is already written.
 * That work had no way into this app at all: listing, staging and editing are
 * all keyed to a run, so an article written somewhere else could only be
 * published by retyping it into the Payload editor by hand.
 */

interface SeedScreenProps {
  busy: boolean
  onStart: (seed: string) => void
  /** Take in a finished article and go straight to staging it. Costs nothing. */
  onPasteArticle: (markdown: string, writtenBy: string) => void
}

export function SeedScreen({ busy, onStart, onPasteArticle }: SeedScreenProps) {
  const [seed, setSeed] = useState('')
  const [pasting, setPasting] = useState(false)
  const [pasted, setPasted] = useState('')
  const [writtenBy, setWrittenBy] = useState('')

  return (
    <section className="p2b-intake" aria-label="Start an article">
      <p className="p2b-eyebrow">What do you want to write about?</p>
      <label className="p2b-field">
        <span className="p2b-label">One line is enough</span>
        <textarea
          value={seed}
          rows={2}
          disabled={busy}
          placeholder="Lima is no longer simply the stopover before Machu Picchu"
          onChange={event => setSeed(event.target.value)}
        />
      </label>
      <p className="p2b-note">
        We&rsquo;ll read up on it first, then ask you a few things only you can answer.
      </p>
      <div className="p2b-intake-actions">
        <button type="button" disabled={busy || !seed.trim()} onClick={() => onStart(seed)}>
          {busy ? 'Reading up…' : 'Start'}
        </button>
      </div>

      {/* The other way in. Nothing below asks a model anything: this is a
          finished article looking for somewhere to be staged from. */}
      <div className="p2b-material">
        <p className="p2b-label">Already written it?</p>
        {pasting ? (
          <>
            <p className="p2b-muted">
              Paste the whole thing, headline included. It gets split the same way
              as one written here, and you land in the Payload editor with it
              loaded.
            </p>
            <label className="p2b-visually-hidden" htmlFor="p2b-pasted-article">
              The article
            </label>
            <textarea
              id="p2b-pasted-article"
              className="p2b-paste-box"
              value={pasted}
              rows={10}
              placeholder={'# The headline\n\nThe article.'}
              onChange={event => setPasted(event.target.value)}
              disabled={busy}
            />
            <label className="p2b-paste-label" htmlFor="p2b-article-written-by">
              Who wrote it? Recorded as your word, since nothing here can check it.
            </label>
            <input
              id="p2b-article-written-by"
              className="p2b-paste-who"
              value={writtenBy}
              placeholder="which model, and where"
              onChange={event => setWrittenBy(event.target.value)}
              disabled={busy}
            />
            <div className="p2b-intake-actions">
              <button
                type="button"
                onClick={() => onPasteArticle(pasted, writtenBy)}
                disabled={busy || !pasted.trim()}
              >
                {busy ? 'Filing it…' : 'Stage this article'}
              </button>
              <button
                type="button"
                className="p2b-secondary"
                onClick={() => setPasting(false)}
                disabled={busy}
              >
                Cancel
              </button>
            </div>
            <p className="p2b-muted">
              {/* Said before the paste, not discovered after it. The detector
                  reads an article against its brief, and an article that never
                  passed through the grill has none. */}
              No grill, no brief, nothing spent. It will not be reviewed by the
              detector, because there is no brief here to read it against.
            </p>
          </>
        ) : (
          <>
            <p className="p2b-muted">
              Paste an article written anywhere else and go straight to staging
              it. It joins Saved Articles like any other.
            </p>
            <button
              type="button"
              className="p2b-secondary"
              onClick={() => setPasting(true)}
              disabled={busy}
            >
              Paste an article
            </button>
          </>
        )}
      </div>
    </section>
  )
}
