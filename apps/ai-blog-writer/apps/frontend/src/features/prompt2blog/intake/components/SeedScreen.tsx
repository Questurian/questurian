import { useState } from 'react'

/**
 * One line, one box.
 *
 * No title field and no location field. A form is a literacy test: it only
 * works if you already know what belongs in each box. Everything the old form
 * asked for is either looked up or asked about in plain English, one question
 * at a time.
 */

interface SeedScreenProps {
  busy: boolean
  onStart: (seed: string) => void
}

export function SeedScreen({ busy, onStart }: SeedScreenProps) {
  const [seed, setSeed] = useState('')

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
    </section>
  )
}
