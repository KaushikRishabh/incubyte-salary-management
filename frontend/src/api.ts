import type { Filters } from './types'

export class ApiError extends Error {
  status: number
  constructor(message: string, status: number) {
    super(message)
    this.name = 'ApiError'
    this.status = status
  }
}
export function apiErrorMessage(detail: unknown): string {
  if (typeof detail === 'string') return detail
  if (Array.isArray(detail))
    return detail
      .map((issue) => {
        if (typeof issue !== 'object' || issue === null) return String(issue)
        const value = issue as { loc?: (string | number)[]; msg?: string }
        const field = value.loc?.filter((part) => part !== 'body').join(' → ')
        return `${field ? `${field}: ` : ''}${value.msg || 'Invalid value'}`
      })
      .join('\n')
  return 'The request could not be completed. Please try again.'
}
export async function request<T>(path: string, init?: RequestInit): Promise<T> {
  let response: Response
  try {
    response = await fetch(path, {
      ...init,
      headers: {
        ...(init?.body ? { 'Content-Type': 'application/json' } : {}),
        ...init?.headers,
      },
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
  return response.json() as Promise<T>
}
export function filterParams(filters: Filters): URLSearchParams {
  const params = new URLSearchParams()
  Object.entries(filters).forEach(([key, value]) => {
    if (value) params.set(key, value)
  })
  return params
}
export const errorText = (error: unknown) =>
  error instanceof Error
    ? error.message
    : 'Something went wrong. Please try again.'
