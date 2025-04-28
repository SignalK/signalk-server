/* eslint-disable @typescript-eslint/no-explicit-any */
import { EventEmitter } from 'node:events'
import { createDebug } from './debug'
import { Debugger } from 'debug'
import { Brand } from '@signalk/server-api'

export function startEvents(
  app: any,
  spark: any,
  onEvent: (data: any) => void,
  eventsFromQuery = ''
) {
  const events = eventsFromQuery.split(',')
  events.forEach((event) => {
    app.on(event, (data: any) => onEvent({ event, data }))
    spark.onDisconnects.push(() => app.removeListener(event, onEvent))
  })
}

export function startServerEvents(app: any, spark: any, onServerEvent: any) {
  app.on('serverevent', onServerEvent)
  spark.onDisconnects.push(() => {
    app.removeListener('serverevent', onServerEvent)
  })
  try {
    spark.write({
      type: 'VESSEL_INFO',
      data: {
        name: app.config.vesselName,
        mmsi: app.config.vesselMMSI,
        uuid: app.config.vesselUUID
      }
    })
  } catch (e: any) {
    if (e.code !== 'ENOENT') {
      console.error(e)
    }
  }
  Object.keys(app.lastServerEvents).forEach((propName) => {
    spark.write(app.lastServerEvents[propName])
  })
  spark.write({
    type: 'DEBUG_SETTINGS',
    data: app.logging.getDebugSettings()
  })
  if (app.securityStrategy.canAuthorizeWS()) {
    spark.write({
      type: 'RECEIVE_LOGIN_STATUS',
      data: app.securityStrategy.getLoginStatus(spark.request)
    })
  }
  spark.write({
    type: 'SOURCEPRIORITIES',
    data: app.config.settings.sourcePriorities || {}
  })
}

type Handler = (...args: any[]) => void
interface EventMap {
  [k: string]: Handler | Handler[] | undefined
}

function safeApply<T, A extends any[]>(
  handler: (this: T, ..._args: A) => void,
  context: T,
  args: A
): void {
  try {
    Reflect.apply(handler, context, args)
  } catch (err) {
    // Throw error after timeout so as not to interrupt the stack
    setTimeout(() => {
      throw err
    })
  }
}

function arrayClone<T>(arr: T[]): T[] {
  const n = arr.length
  const copy = new Array(n)
  for (let i = 0; i < n; i += 1) {
    copy[i] = arr[i]
  }
  return copy
}

export type EventName = Brand<string, 'eventname'>
export type EmitterId = Brand<string, 'emitterId'>
export type ListenerId = Brand<string, 'listenerid'>
export type EventsActorId = EmitterId & ListenerId

export interface WrappedEmitter {
  getEmittedCount: () => number
  getEventRoutingData: () => {
    events: {
      event: string
      emitters: any
      listeners: any
    }[]
  }

  emit: (this: any, eventName: string, ...args: any[]) => boolean
  addListener: (
    eventName: EventName,
    listener: (...args: any[]) => void
  ) => EventEmitter

  bindMethodsById: (eventsId: EventsActorId) => {
    emit: (this: any, eventName: string, ...args: any[]) => boolean
    addListener: (
      eventName: EventName,
      listener: (...args: any[]) => void
    ) => void
    on: (eventName: EventName, listener: (...args: any[]) => void) => void
  }
}

export interface WithWrappedEmitter {
  wrappedEmitter: WrappedEmitter
}

export function wrapEmitter(targetEmitter: EventEmitter): WrappedEmitter {
  const targetAddListener = targetEmitter.addListener.bind(targetEmitter)

  const eventDebugs: { [key: string]: Debugger } = {}
  const eventsData: {
    [eventName: EventName]: {
      emitters: {
        [emitterId: EmitterId]: number
      }
      listeners: {
        [listenerId: ListenerId]: boolean
      }
    }
  } = {}

  let emittedCount = 0

  function safeEmit(this: any, eventName: string, ...args: any[]): boolean {
    if (!/serverlog$/.test(eventName)) {
      let eventDebug = eventDebugs[eventName]
      if (!eventDebug) {
        eventDebugs[eventName] = eventDebug = createDebug(
          `signalk-server:events:${eventName}`
        )
      }
      if (eventDebug.enabled) {
        //there is ever only one rest argument, outputting args results in a 1 element array
        eventDebug(args[0])
      }
    }

    // from https://github.com/MetaMask/safe-event-emitter/blob/main/index.t
    let doError = eventName === 'error'

    const events: EventMap = (targetEmitter as any)._events
    if (events !== undefined) {
      doError = doError && events.error === undefined
    } else if (!doError) {
      return false
    }

    // If there is no 'error' event listener then throw.
    if (doError) {
      let er
      if (args.length > 0) {
        ;[er] = args
      }
      if (er instanceof Error) {
        // Note: The comments on the `throw` lines are intentional, they show
        // up in Node's output if this results in an unhandled exception.
        throw er // Unhandled 'error' event
      }
      // At least give some kind of context to the user
      const err = new Error(`Unhandled error.${er ? ` (${er.message})` : ''}`)

      ;(err as any).context = er
      throw err // Unhandled 'error' event
    }

    const handler = events[eventName]

    if (handler === undefined) {
      return false
    }

    emittedCount++
    if (typeof handler === 'function') {
      safeApply(handler, this, args)
    } else {
      const len = handler.length
      const listeners = arrayClone(handler)
      for (let i = 0; i < len; i += 1) {
        safeApply(listeners[i], this, args)
      }
    }

    return true
  }

  function emitWithEmitterId(
    emitterId: EmitterId,
    eventName: EventName,
    ...args: any[]
  ) {
    const emittersForEvent = (
      eventsData[eventName] ??
      (eventsData[eventName] = { emitters: {}, listeners: {} })
    ).emitters
    if (!emittersForEvent[emitterId]) {
      emittersForEvent[emitterId] = 0
    }
    emittersForEvent[emitterId]++
    safeEmit(`${emitterId}:${eventName}`, ...args)
    return safeEmit(eventName, ...args)
  }

  const addListenerWithId = function (
    listenerId: ListenerId,
    eventName: EventName,
    listener: (...args: any[]) => void
  ) {
    const listenersForEvent = (
      eventsData[eventName] ??
      (eventsData[eventName] = { emitters: {}, listeners: {} })
    ).listeners
    if (!listenersForEvent[listenerId]) {
      listenersForEvent[listenerId] = true
    }
    return targetAddListener(eventName, listener)
  }

  return {
    getEmittedCount: () => emittedCount,
    getEventRoutingData: () => ({
      events: Object.entries(eventsData).map(([event, data]) => ({
        event,
        ...data
      }))
    }),

    emit: function (this: any, eventName: string, ...args: any[]): boolean {
      return emitWithEmitterId(
        'NO_EMITTER_ID' as EmitterId,
        eventName as EventName,
        ...args
      )
    },
    addListener: (eventName: EventName, listener: (...args: any[]) => void) =>
      addListenerWithId('NO_LISTENER_ID' as ListenerId, eventName, listener),

    bindMethodsById: (actorId: EventsActorId) => {
      const addListener = (
        eventName: EventName,
        listener: (...args: any[]) => void
      ) => addListenerWithId(actorId, eventName, listener)
      return {
        emit: function (this: any, eventName: string, ...args: any[]): boolean {
          return emitWithEmitterId(actorId, eventName as EventName, ...args)
        },
        addListener,
        on: addListener
      }
    }
  }
}
