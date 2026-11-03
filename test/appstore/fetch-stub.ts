export interface FetchCall {
  url: string
  init?: RequestInit
}

type Responder = (
  url: string,
  init?: RequestInit
) => Response | Promise<Response>

export async function withFetch(
  respond: Responder,
  fn: (calls: FetchCall[]) => Promise<void>
): Promise<void> {
  const original = globalThis.fetch
  const calls: FetchCall[] = []
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url =
      typeof input === 'string'
        ? input
        : input instanceof URL
          ? input.href
          : input.url
    calls.push({ url, init })
    return respond(url, init)
  }) as typeof fetch
  try {
    await fn(calls)
  } finally {
    globalThis.fetch = original
  }
}

export function redirectTo(location: string): Response {
  return new Response(null, { status: 302, headers: { location } })
}
