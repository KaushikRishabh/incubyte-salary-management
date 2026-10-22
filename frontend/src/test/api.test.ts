import { describe, expect, it, vi } from 'vitest'
import { ApiError, apiErrorMessage, errorText, request } from '../api'

/** Exercise the transport boundary separately from UI tests so HTTP semantics are
 * not accidentally hidden by a happy-path fetch mock. No real server is contacted.
 */
describe('JSON request boundary', () => {
  it('adds a JSON content type and preserves a Headers instance', async () => {
    const fetch = vi.fn().mockResolvedValue(new Response('{"saved":true}'))
    vi.stubGlobal('fetch', fetch)
    expect(
      await request('/api/example', {
        method: 'POST',
        body: '{}',
        headers: new Headers({ 'X-Request-ID': 'test-request' }),
      }),
    ).toEqual({ saved: true })
    const headers = new Headers(fetch.mock.calls[0][1].headers)
    expect(headers.get('Content-Type')).toBe('application/json')
    expect(headers.get('X-Request-ID')).toBe('test-request')
  })

  it('retains an explicit content type supplied as header tuples', async () => {
    const fetch = vi.fn().mockResolvedValue(new Response('{}'))
    vi.stubGlobal('fetch', fetch)
    await request('/api/example', {
      body: '{}',
      headers: [['Content-Type', 'application/vnd.example+json']],
    })
    expect(
      new Headers(fetch.mock.calls[0][1].headers).get('Content-Type'),
    ).toBe('application/vnd.example+json')
  })

  it('does not attach a JSON content type to bodyless reads', async () => {
    const fetch = vi.fn().mockResolvedValue(new Response('{}'))
    vi.stubGlobal('fetch', fetch)
    await request('/api/example')
    expect(
      new Headers(fetch.mock.calls[0][1].headers).has('Content-Type'),
    ).toBe(false)
  })

  it('preserves conflict status and structured field feedback', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({
            detail: [{ loc: ['body', 'version'], msg: 'Stale version' }],
          }),
          { status: 409 },
        ),
      ),
    )
    await expect(request('/api/example')).rejects.toMatchObject({
      name: 'ApiError',
      status: 409,
      message: 'version: Stale version',
    })
  })

  it('handles a non-JSON error page without exposing parser internals', async () => {
    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockResolvedValue(
          new Response('<html>Gateway error</html>', { status: 502 }),
        ),
    )
    await expect(request('/api/example')).rejects.toMatchObject({
      status: 502,
      message: 'The request could not be completed. Please try again.',
    })
  })

  it('gives actionable feedback for a malformed successful response', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(new Response('<html>Not JSON</html>')),
    )
    await expect(request('/api/example')).rejects.toMatchObject({
      status: 200,
      message: 'The server returned an unreadable response. Please try again.',
    })
  })

  it('normalizes network failure but never retries a potentially completed write', async () => {
    const fetch = vi.fn().mockRejectedValue(new TypeError('Failed to fetch'))
    vi.stubGlobal('fetch', fetch)
    await expect(
      request('/api/example', { method: 'POST', body: '{}' }),
    ).rejects.toMatchObject({
      status: 0,
      message: expect.stringContaining('The server is unavailable'),
    })
    expect(fetch).toHaveBeenCalledTimes(1)
  })

  // Cancellation is intentional navigation, not a user-visible API failure.
  it('preserves abort errors both before and after headers arrive', async () => {
    const aborted = new DOMException('Canceled', 'AbortError')
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(aborted))
    await expect(request('/api/example')).rejects.toBe(aborted)
    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockResolvedValue({ ok: true, json: () => Promise.reject(aborted) }),
    )
    await expect(request('/api/example')).rejects.toBe(aborted)
  })

  it('provides safe error text for values that are not Error instances', () => {
    expect(errorText(new ApiError('Readable failure', 422))).toBe(
      'Readable failure',
    )
    expect(errorText(null)).toBe('Something went wrong. Please try again.')
    expect(apiErrorMessage(null)).toContain('could not be completed')
    expect(apiErrorMessage(['First issue', { msg: 'Second issue' }])).toBe(
      'First issue\nSecond issue',
    )
  })
})
