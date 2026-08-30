/* @vitest-environment jsdom */
import '@testing-library/jest-dom/vitest'
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import {
  creativityReachesWriter,
  PROMPT2BLOG_MODEL_STACKS,
} from '../../constants/prompt2blog.constants'
import { PromptProfilesPanel } from './PromptProfilesPanel'

afterEach(cleanup)

const noop = () => {}

describe('creativity control honesty', () => {
  it('says so when the setting does not reach the writing model', () => {
    // Every current route writes on Claude, and the Claude plan transport has
    // no temperature flag, so the dial is inert on every run today.
    expect(PROMPT2BLOG_MODEL_STACKS.every(stack => !creativityReachesWriter(stack.id)))
      .toBe(true)

    render(
      <PromptProfilesPanel
        brandVoiceId="questurian-default"
        creativityLevel="medium"
        inputOptions={null}
        lengthId="long"
        toneId="practical"
        onChange={noop}
        onClear={noop}
      />,
    )

    expect(screen.getByTestId('p2b-creativity-inert')).toHaveTextContent(
      /does not change the draft/i,
    )
  })

  it('reports the dial as connected for a writer that honours temperature', () => {
    // Guards the direction of the check: this must start passing again by
    // itself if a Gemini writer is ever selected, not stay stuck on a warning.
    const geminiWritingStack = {
      ...PROMPT2BLOG_MODEL_STACKS[0],
      id: 'gemini-writer-probe' as (typeof PROMPT2BLOG_MODEL_STACKS)[number]['id'],
      writingModel:
        'gemini-3.1-pro-preview' as (typeof PROMPT2BLOG_MODEL_STACKS)[number]['writingModel'],
    }
    PROMPT2BLOG_MODEL_STACKS.push(geminiWritingStack)
    try {
      expect(creativityReachesWriter('gemini-writer-probe')).toBe(true)
    } finally {
      PROMPT2BLOG_MODEL_STACKS.pop()
    }
  })
})
