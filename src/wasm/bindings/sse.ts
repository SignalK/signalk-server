/**
 * Server-Sent Event channels for WASM plugins
 *
 * An HTTP handler opens a stream by returning `{"sseChannel": "<name>"}`;
 * the plugin later pushes events to every open stream of that channel
 * with the `sk_sse_send` import. The plugin never holds a connection, so
 * this fits the synchronous handler model.
 */

import { Response } from 'express'
import Debug from 'debug'

const debug = Debug('signalk:wasm:sse')

// Proxies and browsers drop idle connections; a comment line keeps them open
export const SSE_KEEPALIVE_INTERVAL_MS = 15000
const SSE_KEEPALIVE_COMMENT = ': keep-alive\n\n'

// A client that stops reading (sleeping display, dead link) is dropped
// once this much output is queued for it, so it cannot grow server memory
export const SSE_MAX_BUFFERED_BYTES = 1024 * 1024

const LINE_BREAK = /\r\n|\r|\n/

type ChannelSubscribers = Set<Response>

const pluginChannels = new Map<string, Map<string, ChannelSubscribers>>()

/**
 * Drop `res` from its channel and prune empty channel and plugin maps,
 * so idle plugins hold no registry entries.
 */
function removeSubscriber(
  pluginId: string,
  channel: string,
  res: Response
): void {
  const channels = pluginChannels.get(pluginId)
  const subscribers = channels?.get(channel)
  if (!channels || !subscribers) {
    return
  }
  subscribers.delete(res)
  if (subscribers.size === 0) {
    channels.delete(channel)
    if (channels.size === 0) {
      pluginChannels.delete(pluginId)
    }
  }
}

/**
 * Turn `res` into an event stream and add it to the plugin's channel.
 * `initial` is raw event-stream text sent to this client only, so it can
 * render the current state before the next broadcast.
 */
export function openSseStream(
  pluginId: string,
  channel: string,
  res: Response,
  initial?: string
): void {
  // A client that disconnected before the handler returned never emits
  // another 'close', so registering it would leak the subscription
  if (res.destroyed) {
    return
  }

  res.status(200)
  res.setHeader('Content-Type', 'text/event-stream; charset=utf-8')
  // no-transform keeps the compression middleware from buffering events
  res.setHeader('Cache-Control', 'no-cache, no-transform')
  res.setHeader('Connection', 'keep-alive')
  // Disable response buffering in nginx and similar reverse proxies
  res.setHeader('X-Accel-Buffering', 'no')
  // An initial body beyond the per-client limit would leave the client over
  // it until the next event checks
  if (initial && Buffer.byteLength(initial) > SSE_MAX_BUFFERED_BYTES) {
    res.destroy()
    return
  }
  res.flushHeaders()

  if (initial) {
    res.write(initial)
  }

  let channels = pluginChannels.get(pluginId)
  if (!channels) {
    channels = new Map()
    pluginChannels.set(pluginId, channels)
  }
  let subscribers = channels.get(channel)
  if (!subscribers) {
    subscribers = new Set()
    channels.set(channel, subscribers)
  }
  subscribers.add(res)

  const keepAlive = setInterval(() => {
    // An ended stream can stay open until its buffer drains, and writing
    // to it would emit an unhandled 'error'
    if (res.writableEnded) {
      return
    }
    // On a quiet channel keep-alives are all a stalled client receives, so
    // they are held to the same limit as events
    if (
      res.writableLength + SSE_KEEPALIVE_COMMENT.length >
      SSE_MAX_BUFFERED_BYTES
    ) {
      res.destroy()
      return
    }
    res.write(SSE_KEEPALIVE_COMMENT)
  }, SSE_KEEPALIVE_INTERVAL_MS)

  res.on('close', () => {
    clearInterval(keepAlive)
    removeSubscriber(pluginId, channel, res)
    debug('[%s] SSE client left channel %s', pluginId, channel)
  })

  debug('[%s] SSE client joined channel %s', pluginId, channel)
}

/**
 * Format one event in event-stream syntax. An empty event name is left
 * out, so clients see it as the default `message` event.
 */
export function formatSseEvent(event: string, data: string): string {
  let frame = event ? `event: ${event}\n` : ''
  for (const line of data.split(LINE_BREAK)) {
    frame += `data: ${line}\n`
  }
  return frame + '\n'
}

/**
 * Send an event to every subscriber of the plugin's channel.
 * Returns the number of clients it was written to, or -1 if the event
 * name would break the stream framing or the event alone exceeds the
 * per-client output limit.
 */
export function sendSseEvent(
  pluginId: string,
  channel: string,
  event: string,
  data: string
): number {
  if (LINE_BREAK.test(event)) {
    return -1
  }
  const subscribers = pluginChannels.get(pluginId)?.get(channel)
  if (!subscribers) {
    return 0
  }

  // Encode once instead of once per client
  const frame = Buffer.from(formatSseEvent(event, data))
  if (frame.length > SSE_MAX_BUFFERED_BYTES) {
    return -1
  }
  let sent = 0
  for (const res of subscribers) {
    if (res.writableLength + frame.length > SSE_MAX_BUFFERED_BYTES) {
      debug('[%s] dropping slow SSE client on %s', pluginId, channel)
      // end() would wait for the backlog to drain, which a stalled client
      // never does; destroying frees the buffer and fires 'close' now
      res.destroy()
      continue
    }
    res.write(frame)
    sent++
  }
  return sent
}

/**
 * End every open stream of a plugin when it stops, so clients see the
 * stream close and reconnect instead of waiting on a silent channel.
 */
export function closeSseStreamsForPlugin(pluginId: string): void {
  const channels = pluginChannels.get(pluginId)
  if (!channels) {
    return
  }
  pluginChannels.delete(pluginId)
  for (const subscribers of channels.values()) {
    for (const res of subscribers) {
      // end() waits for queued output to drain, which a stalled client
      // never does, so 'close' would never fire and its keep-alive would
      // keep running; destroy such a client instead
      if (res.writableLength > 0) {
        res.destroy()
      } else {
        res.end()
      }
    }
  }
}
