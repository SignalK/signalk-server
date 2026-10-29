// Bounds what a client can make the server keep in memory.
const USER_AGENT_MAX_LENGTH = 256

export function userAgentOf(
  headers: Record<string, string | string[] | undefined>
): string | undefined {
  const userAgent = headers['user-agent']
  return typeof userAgent === 'string' && userAgent
    ? userAgent.slice(0, USER_AGENT_MAX_LENGTH)
    : undefined
}
