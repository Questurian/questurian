import { useState } from 'react'

/**
 * One box, and what goes in it is a working title.
 *
 * This is the one place the listicle intake deliberately differs from the
 * article one at the very first screen. An article starts from a thought
 * ("Lima's fog is the only rain the city gets"); a listicle starts from a
 * finished, SEO-shaped headline ("The Best Cevicherias in Lima"), because
 * that headline already carries the type, the place and the count.
 *
 * The title is written for search, not as a statement of method. "Best"
 * promises nothing about how the list was built — that gets asked about
 * separately, and nothing here should read criteria out of the headline.
 */

interface SeedScreenProps {
  busy: boolean
  onStart: (seed: string) => void
}

export function SeedScreen({ busy, onStart }: SeedScreenProps) {
  const [seed, setSeed] = useState('')

  return (
    <section className="lp-intake" aria-label="Start a listicle">
      <p className="lp-eyebrow">What is the list?</p>
      <label className="lp-field">
        <span className="lp-label">Paste a working title</span>
        <textarea
          value={seed}
          rows={2}
          disabled={busy}
          placeholder="The Best Cevicherias in Lima"
          onChange={event => setSeed(event.target.value)}
        />
      </label>
      <p className="lp-note">
        Write it the way it would run as a headline. The type, the place and the count
        get read off it, and you confirm them next.
      </p>
      <div className="lp-actions">
        <button type="button" disabled={busy || !seed.trim()} onClick={() => onStart(seed)}>
          Start
        </button>
      </div>
    </section>
  )
}
