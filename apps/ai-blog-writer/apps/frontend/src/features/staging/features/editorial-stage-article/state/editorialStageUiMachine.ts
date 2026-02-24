export type PublishResult = { success: boolean; message: string } | null

export type PublishPhase =
  | 'idle'
  | 'validating'
  | 'converting'
  | 'publishing'
  | 'success'
  | 'error'

export type EditorialStageUiState = {
  publishPhase: PublishPhase
  publishResult: PublishResult
  pickers: {
    openEditorialTarget: string | null
    openImageTarget: string | null
  }
  modals: {
    featuredOpen: boolean
    blockOpen: boolean
    cropOpen: boolean
  }
}

export type EditorialStageUiEvent =
  | { type: 'TOGGLE_EDITORIAL_PICKER'; target: string }
  | { type: 'TOGGLE_IMAGE_PICKER'; target: string }
  | { type: 'CLOSE_EDITORIAL_PICKER' }
  | { type: 'CLOSE_IMAGE_PICKER' }
  | { type: 'SET_PUBLISH_RESULT'; result: PublishResult }
  | { type: 'PUBLISH_REQUEST' }
  | { type: 'PUBLISH_CONVERTING' }
  | { type: 'PUBLISH_SUBMITTING' }
  | { type: 'PUBLISH_SUCCESS'; message: string }
  | { type: 'PUBLISH_FAILURE'; message: string }
  | { type: 'SYNC_MODAL_FLAGS'; featuredOpen: boolean; blockOpen: boolean; cropOpen: boolean }

export function createInitialEditorialStageUiState(): EditorialStageUiState {
  return {
    publishPhase: 'idle',
    publishResult: null,
    pickers: {
      openEditorialTarget: null,
      openImageTarget: null,
    },
    modals: {
      featuredOpen: false,
      blockOpen: false,
      cropOpen: false,
    },
  }
}

export function editorialStageUiReducer(
  state: EditorialStageUiState,
  event: EditorialStageUiEvent
): EditorialStageUiState {
  switch (event.type) {
    case 'TOGGLE_EDITORIAL_PICKER':
      return {
        ...state,
        pickers: {
          ...state.pickers,
          openEditorialTarget:
            state.pickers.openEditorialTarget === event.target ? null : event.target,
        },
      }

    case 'TOGGLE_IMAGE_PICKER':
      return {
        ...state,
        pickers: {
          ...state.pickers,
          openImageTarget: state.pickers.openImageTarget === event.target ? null : event.target,
        },
      }

    case 'CLOSE_EDITORIAL_PICKER':
      return {
        ...state,
        pickers: {
          ...state.pickers,
          openEditorialTarget: null,
        },
      }

    case 'CLOSE_IMAGE_PICKER':
      return {
        ...state,
        pickers: {
          ...state.pickers,
          openImageTarget: null,
        },
      }

    case 'SET_PUBLISH_RESULT':
      return {
        ...state,
        publishResult: event.result,
      }

    case 'PUBLISH_REQUEST':
      return {
        ...state,
        publishPhase: 'validating',
        publishResult: null,
      }

    case 'PUBLISH_CONVERTING':
      return {
        ...state,
        publishPhase: 'converting',
      }

    case 'PUBLISH_SUBMITTING':
      return {
        ...state,
        publishPhase: 'publishing',
      }

    case 'PUBLISH_SUCCESS':
      return {
        ...state,
        publishPhase: 'success',
        publishResult: {
          success: true,
          message: event.message,
        },
      }

    case 'PUBLISH_FAILURE':
      return {
        ...state,
        publishPhase: 'error',
        publishResult: {
          success: false,
          message: event.message,
        },
      }

    case 'SYNC_MODAL_FLAGS':
      return {
        ...state,
        modals: {
          featuredOpen: event.featuredOpen,
          blockOpen: event.blockOpen,
          cropOpen: event.cropOpen,
        },
      }

    default:
      return state
  }
}
