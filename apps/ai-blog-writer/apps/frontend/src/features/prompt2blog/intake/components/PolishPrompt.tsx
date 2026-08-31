import { useState } from 'react'
import { readPolishPrompt } from '../intake.api'

/**
 * One prompt, one paste, one flagship model.
 *
 * The run measured everything wrong with its own prose and recorded it where
 * nobody read it. This hands it over along with the brief and the article, so
 * the editing pass happens somewhere that is good at prose rather than in
 * another pipeline stage.
 *
 * Copy only. It is deliberately not editable here: operator influence belongs
 * in a control carrying its own validated field, and typed changes to a
 * generated prompt leave nothing downstream able to say what was asked for.
 */

interface PolishPromptProps {
  runId: string
}

export function PolishPrompt({ runId }: PolishPromptProps) {
  const [state, setState] = useState<'idle' | 'loading' | 'copied' | 'failed'>('idle')

  async function copy() {
    setState('loading')
    try {
      const { prompt } = await readPolishPrompt(runId)
      await navigator.clipboard.writeText(prompt)
      setState('copied')
    } catch {
      setState('failed')
    }
  }

  return (
    <div className="p2b-polish">
      <p className="p2b-polish-copy">
        Editing this in a chatbot is usually faster than another pass here. The
        prompt carries what the run measured, the brief it was written to, and the
        article.
      </p>
      <div className="p2b-intake-actions">
        <button
          type="button"
          className="p2b-secondary"
          onClick={copy}
          disabled={state === 'loading'}
        >
          {state === 'copied' ? 'Copied' : 'Copy the editing prompt'}
        </button>
      </div>
      {state === 'copied' && (
        <p className="p2b-note">
          Paste it into Claude or ChatGPT. It asks for the whole article back and
          nothing else.
        </p>
      )}
      {state === 'failed' && (
        <p className="p2b-note">
          Could not copy it. Your browser may be blocking clipboard access on this
          page.
        </p>
      )}
    </div>
  )
}
