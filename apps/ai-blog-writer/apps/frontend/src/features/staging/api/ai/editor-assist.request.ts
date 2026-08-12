import { apiFetch } from '../../../../shared/api/client/apiFetch'
import { parseErrorResponse } from '../../../../shared/api/client/error-parser'

type EditorAssistRequestOptions = {
  method?: 'GET' | 'POST'
  body?: unknown
  errorMessage: string
}

export async function requestEditorAssist<TResponse>(
  path: string,
  { method = 'POST', body, errorMessage }: EditorAssistRequestOptions
): Promise<TResponse> {
  const response = await apiFetch(`/editor-assist/${path}`, {
    method,
    headers: {
      'Content-Type': 'application/json'
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) })
  })

  if (!response.ok) {
    const message = await parseErrorResponse(response, errorMessage, {
      detail: errorMessage
    })
    throw new Error(message)
  }

  return response.json() as Promise<TResponse>
}
