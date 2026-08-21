export type ListicleMapNavigationState = {
  activeId: string | null
  targetId: string | null
}

export type ListicleMapNavigationAction =
  | { type: 'observe'; id: string | null; aboveList: boolean }
  | { type: 'navigate'; id: string }
  | { type: 'release'; targetId: string; observedId: string | null }
  | { type: 'reset' }

export const initialListicleMapNavigationState: ListicleMapNavigationState = {
  activeId: null,
  targetId: null,
}

export function listicleMapNavigationReducer(
  state: ListicleMapNavigationState,
  action: ListicleMapNavigationAction,
): ListicleMapNavigationState {
  switch (action.type) {
    case 'observe':
      if (state.targetId !== null) return state
      // Gaps between entries - ad slots, separators, tall media - must not
      // read as "no stop". Releasing to the all-pins overview mid-article
      // makes the map fly out and back for every ad the reader scrolls past,
      // so the last stop holds until another one takes the band. Only the run
      // of page above the first entry is a real absence of stops.
      if (action.id === null && !action.aboveList) return state
      return { ...state, activeId: action.id }
    case 'navigate':
      return { activeId: action.id, targetId: action.id }
    case 'release':
      if (state.targetId !== action.targetId) return state
      return { activeId: action.observedId, targetId: null }
    case 'reset':
      return initialListicleMapNavigationState
  }
}
