import { afterEach, describe, expect, it, vi } from 'vitest'
import { handOffWheel, leftoverDelta } from './scrollHandoff'

/**
 * A card scrolled to its end must not swallow the rest of the gesture. The
 * operator reported having to stop and scroll a second time at every card.
 */

describe('what a box cannot use', () => {
  it('takes the whole movement while it has room', () => {
    expect(leftoverDelta(0, 200, 500, 100)).toBe(0)
    expect(leftoverDelta(300, 200, 500, -100)).toBe(0)
  })

  it('gives everything away at its end', () => {
    expect(leftoverDelta(300, 200, 500, 80)).toBe(80)
    expect(leftoverDelta(0, 200, 500, -80)).toBe(-80)
  })

  it('uses the room it has and gives away only the rest', () => {
    expect(leftoverDelta(280, 200, 500, 50)).toBe(30)
    expect(leftoverDelta(20, 200, 500, -50)).toBe(-30)
  })

  it('gives everything away when it does not scroll at all', () => {
    expect(leftoverDelta(0, 240, 240, 60)).toBe(60)
    expect(leftoverDelta(0, 240, 240, -60)).toBe(-60)
  })
})

describe('handing the wheel to the page', () => {
  afterEach(() => vi.restoreAllMocks())

  it('scrolls the page with what the box could not use', () => {
    const scrollBy = vi.spyOn(window, 'scrollBy').mockImplementation(() => {})
    const box = document.createElement('div')
    document.body.appendChild(box)
    const release = handOffWheel(box)

    // jsdom lays nothing out, so this box has no room in either direction.
    const event = new WheelEvent('wheel', { deltaY: 120, cancelable: true })
    box.dispatchEvent(event)

    expect(scrollBy).toHaveBeenCalledWith(0, 120)
    expect(event.defaultPrevented).toBe(true)

    release()
    box.dispatchEvent(new WheelEvent('wheel', { deltaY: 120, cancelable: true }))
    expect(scrollBy).toHaveBeenCalledTimes(1)
    box.remove()
  })

  it('leaves a pinch-zoom alone', () => {
    const scrollBy = vi.spyOn(window, 'scrollBy').mockImplementation(() => {})
    const box = document.createElement('div')
    const release = handOffWheel(box)

    const event = new WheelEvent('wheel', { deltaY: 40, ctrlKey: true, cancelable: true })
    box.dispatchEvent(event)

    expect(scrollBy).not.toHaveBeenCalled()
    expect(event.defaultPrevented).toBe(false)
    release()
  })
})
