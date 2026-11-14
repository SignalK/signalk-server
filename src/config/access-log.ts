import type { IncomingMessage, ServerResponse } from 'http'

type LoggedRequest = IncomingMessage & { originalUrl?: string }

interface Morgan {
  (
    format: string,
    options?: object
  ): (
    req: IncomingMessage,
    res: ServerResponse,
    next: (err?: unknown) => void
  ) => void
  token(
    name: string,
    callback: (req: LoggedRequest) => string | undefined
  ): void
}

// eslint-disable-next-line @typescript-eslint/no-require-imports
const morgan: Morgan = require('morgan')

const QUERY_PARAMETER = /([?&])([^=&#]*)=([^&#]*)/g
const REDACTED = 'REDACTED'

// The server reads the parameter name decoded, so %74oken is a token too.
function isTokenName(name: string): boolean {
  try {
    return decodeURIComponent(name).toLowerCase() === 'token'
  } catch {
    return false
  }
}

function redactTokenQuery(url: string | undefined): string | undefined {
  return url?.replace(
    QUERY_PARAMETER,
    (parameter: string, separator: string, name: string) =>
      isTokenName(name) ? `${separator}${name}=${REDACTED}` : parameter
  )
}

// A token query parameter is a credential, and browsers send the page URL
// as the Referer of every request the page makes, so neither is logged
// with the token value.
morgan.token('url', (req) => redactTokenQuery(req.originalUrl || req.url))
morgan.token('referrer', (req) => {
  const referrer = req.headers.referer || req.headers.referrer
  return redactTokenQuery(
    Array.isArray(referrer) ? referrer.join(', ') : referrer
  )
})

export const accessLogger = morgan
