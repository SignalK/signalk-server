// Loose on purpose: stream messages are untrusted JSON until checked here
interface UnsubscribeShape {
  context?: unknown
  unsubscribe?: unknown
}

export function isUnsubscribeAll(msg: UnsubscribeShape): boolean {
  return (
    msg.context === '*' &&
    Array.isArray(msg.unsubscribe) &&
    msg.unsubscribe.length === 1 &&
    msg.unsubscribe[0]?.path === '*'
  )
}

export function isUnsubscribeById(
  msg: UnsubscribeShape
): msg is { unsubscribe: { subscriptionId: string }[] } {
  return (
    Array.isArray(msg.unsubscribe) &&
    msg.unsubscribe.every((row) => typeof row?.subscriptionId === 'string')
  )
}
