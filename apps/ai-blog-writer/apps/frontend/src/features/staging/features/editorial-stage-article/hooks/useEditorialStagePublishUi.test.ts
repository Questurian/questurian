import { act, renderHook } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { useEditorialStagePublishUi } from './useEditorialStagePublishUi'

describe('useEditorialStagePublishUi', () => {
  it('maps workflow lifecycle callbacks to reducer events', () => {
    const dispatchUi = vi.fn()
    const { result } = renderHook(() =>
      useEditorialStagePublishUi({
        dispatchUi,
        publishPhase: 'validating',
        publishResult: null
      })
    )

    act(() => {
      result.current.lifecycle.request()
      result.current.lifecycle.converting()
      result.current.lifecycle.submitting()
      result.current.lifecycle.succeed('Published')
      result.current.lifecycle.fail('Failed')
    })

    expect(dispatchUi.mock.calls.map(([event]) => event)).toEqual([
      { type: 'PUBLISH_REQUEST' },
      { type: 'PUBLISH_CONVERTING' },
      { type: 'PUBLISH_SUBMITTING' },
      { type: 'PUBLISH_SUCCESS', message: 'Published' },
      { type: 'PUBLISH_FAILURE', message: 'Failed' }
    ])
    expect(result.current.isPublishing).toBe(true)
    expect(result.current.isConverting).toBe(false)
  })

  it('derives conversion UI state and preserves the publish result', () => {
    const publishResult = { success: false, message: 'Failed' }
    const { result } = renderHook(() =>
      useEditorialStagePublishUi({
        dispatchUi: vi.fn(),
        publishPhase: 'converting',
        publishResult
      })
    )

    expect(result.current.isPublishing).toBe(true)
    expect(result.current.isConverting).toBe(true)
    expect(result.current.publishResult).toBe(publishResult)
  })
})
