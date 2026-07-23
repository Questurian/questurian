export type ListicleMapNavigationState = {
  activeId: string | null
  targetId: string | null
}

export type ListicleMapNavigationAction =
  | { type: 'observe'; id: string | null }
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
