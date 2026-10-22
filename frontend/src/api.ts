import type { Filters } from './types'

/** Preserve the HTTP status so dialogs can distinguish a stale write (409) from a retryable failure. */
export class ApiError extends Error {
  status: number
  constructor(message: string, status: number) {
    super(message)
    this.name = 'ApiError'
    this.status = status
  }
}
/** FastAPI returns either a domain error string or a list of field-validation issues. */
export function apiErrorMessage(detail: unknown): string {
  if (typeof detail === 'string') return detail
  if (Array.isArray(detail))
    return detail
      .map((issue) => {
        if (typeof issue !== 'object' || issue === null) return String(issue)
        const value = issue as { loc?: (string | number)[]; msg?: string }
        // Remove the transport-level 'body' prefix but retain nested field/row locations.
        const field = value.loc?.filter((part) => part !== 'body').join(' → ')
        return `${field ? `${field}: ` : ''}${value.msg || 'Invalid value'}`
      })
      .join('\n')
  return 'The request could not be completed. Please try again.'
}
/** JSON-only API boundary: T describes the expected response; the backend validates writes.
 * A canceled read is deliberately not converted into a network-error message.
 */
export async function request<T>(path: string, init?: RequestInit): Promise<T> {
  // Headers accepts all RequestInit header shapes, including Headers and tuple arrays.
  const headers = new Headers(init?.headers)
  if (init?.body && !headers.has('Content-Type'))
    headers.set('Content-Type', 'application/json')
  let response: Response
  try {
    response = await fetch(path, {
      ...init,
      headers,
    })
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError')
      throw error
    throw new ApiError(
      'The server is unavailable. Check that the API is running, then try again.',
      0,
    )
  }
  if (!response.ok) {
    const data = (await response.json().catch(() => null)) as {
      detail?: unknown
    } | null
    throw new ApiError(apiErrorMessage(data?.detail), response.status)
  }
  try {
    return (await response.json()) as T
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError')
      throw error
    // A proxy or broken server may return HTML with 200; do not leak a JSON parser error.
    throw new ApiError(
      'The server returned an unreadable response. Please try again.',
      response.status,
    )
  }
}
/** Shared by lists, aggregates, and exports so each uses the same filter vocabulary. */
export function filterParams(filters: Filters): URLSearchParams {
  const params = new URLSearchParams()
  Object.entries(filters).forEach(([key, value]) => {
    if (value) params.set(key, value)
  })
  return params
}
/** Catch values are unknown in strict TypeScript; provide a safe non-Error fallback. */
export const errorText = (error: unknown) =>
  error instanceof Error
    ? error.message
    : 'Something went wrong. Please try again.'
