import { Request, Response, Application } from 'express'
import { Context, Path, SourceRef } from '@signalk/server-api'
import { createDebug } from './debug'
import {
  createRequest,
  updateRequest,
  Reply,
  RequestState
} from './requestResponse'
import * as skConfig from './config/config'
import { ConfigApp } from './config/config'
import { getMetadata } from '@signalk/signalk-schema'
import { validateCategoryAssignment } from './unitpreferences'
import { WithSecurityStrategy } from './security'

const debug = createDebug('signalk-server:put')

interface WsInterface {
  canHandlePut: (path: string, source: string | undefined) => boolean
  handlePut: (
    requestId: string,
    context: string,
    path: string,
    source: string | undefined,
    value: unknown
  ) => Promise<Reply>
}

interface PutAppInterfaces {
  ws?: WsInterface
  [key: string]: unknown
}

interface PutApp extends Application {
  config: ConfigApp['config']
  intervals: NodeJS.Timeout[]
  interfaces: PutAppInterfaces
  signalk: ConfigApp['signalk']
  handleMessage: ConfigApp['handleMessage']
  securityStrategy: WithSecurityStrategy['securityStrategy']
  registerActionHandler?: typeof registerActionHandler
  deRegisterActionHandler?: typeof deRegisterActionHandler
}

interface PathApp {
  intervals: NodeJS.Timeout[]
  interfaces: PutAppInterfaces
  securityStrategy: WithSecurityStrategy['securityStrategy']
}

interface NotificationApp {
  signalk: ConfigApp['signalk']
  handleMessage: ConfigApp['handleMessage']
}

const pathPrefix = '/signalk'
const versionPrefix = '/v1'
const apiPathPrefix = pathPrefix + versionPrefix + '/api/'

const TRAILING_SLASH = /\/$/
const SLASH_GLOBAL = /\//g

type ActionCallback = (reply: ActionResult) => void

interface ActionResult {
  state: RequestState | 'SUCCESS' | 'FAILURE' | 'PENDING'
  statusCode?: number
  message?: string
}

type ActionHandler = (
  context: string,
  path: string,
  value: unknown,
  callback: ActionCallback
) => ActionResult | void

type DeleteHandler = (
  context: string,
  path: string,
  callback: ActionCallback
) => ActionResult | void

interface ActionHandlers {
  [context: string]: {
    [path: string]: {
      [source: string]: ActionHandler
    }
  }
}

interface PutBody {
  value: unknown
  source?: string
}

interface SkRequest extends Request {
  skPrincipal?: {
    identifier: string
  }
}

type ReplyWithAction = Reply & { action?: { href: string } }

const actionHandlers: ActionHandlers = {}
let putMetaHandler: ActionHandler
let deleteMetaHandler: DeleteHandler
let putNotificationHandler: (
  context: string,
  path: string,
  value: unknown
) => ActionResult

function parseRequestPath(
  reqPath: string
): { context: string; skpath: string } | null {
  const cleaned = String(reqPath)
    .replace(apiPathPrefix, '')
    .replace(TRAILING_SLASH, '')
    .replace(SLASH_GLOBAL, '.')

  if (cleaned.length === 0) {
    return null
  }

  const parts = cleaned.split('.')
  if (parts.length < 3) {
    return null
  }

  return {
    context: `${parts[0]}.${parts[1]}`,
    skpath: parts.slice(2).join('.')
  }
}

function isMetaPath(parts: string[]): boolean {
  if (parts.length < 2) {
    return false
  }
  return (
    parts[parts.length - 1] === 'meta' || parts[parts.length - 2] === 'meta'
  )
}

function fixReply(reply: ActionResult): void {
  if (reply.state === 'FAILURE') {
    reply.state = 'COMPLETED'
    reply.statusCode = 502
  } else if (reply.state === 'SUCCESS') {
    reply.state = 'COMPLETED'
    reply.statusCode = 200
  }
}

function getByDottedPath(
  obj: Record<string, unknown> | undefined,
  dotted: string
): unknown {
  if (obj === undefined || obj === null) {
    return undefined
  }
  let current: unknown = obj
  for (const segment of dotted.split('.')) {
    if (current === null || current === undefined) {
      return undefined
    }
    current = (current as Record<string, unknown>)[segment]
  }
  return current
}

function setByDottedPath(
  obj: Record<string, unknown>,
  dotted: string,
  value: unknown
): void {
  const segments = dotted.split('.')
  const last = segments.length - 1
  let current: Record<string, unknown> = obj
  for (let i = 0; i < last; i++) {
    const key = segments[i]
    const next = current[key]
    if (next === null || typeof next !== 'object') {
      current[key] = {}
    }
    current = current[key] as Record<string, unknown>
  }
  current[segments[last]] = value
}

function respondToParsedRequest(res: Response, promise: Promise<Reply>): void {
  promise
    .then((reply) => {
      res.status(reply.statusCode)
      res.json(reply)
    })
    .catch((err) => {
      console.error(err)
      res.status(500).send(err.message)
    })
}

function finalizeReply(
  request: { requestId: string },
  result: ActionResult,
  applyFix: boolean,
  resolve: (reply: Reply) => void,
  reject: (err: Error) => void
): void {
  if (applyFix) {
    fixReply(result)
  }
  updateRequest(request.requestId, result.state as RequestState, result)
    .then((reply) => {
      if (reply.state === 'PENDING') {
        ;(reply as ReplyWithAction).action = { href: reply.href }
      }
      resolve(reply)
    })
    .catch(reject)
}

function handleActionResult(
  request: { requestId: string },
  actionResult: ActionResult | void | Promise<ActionResult | void>,
  applyFix: boolean,
  resolve: (reply: Reply) => void,
  reject: (err: Error) => void
): void {
  Promise.resolve(actionResult)
    .then((result) => {
      if (debug.enabled) {
        debug('got result: %j', result)
      }
      finalizeReply(request, result!, applyFix, resolve, reject)
    })
    .catch((err) => {
      updateRequest(request.requestId, 'COMPLETED', {
        statusCode: 500,
        message: err.message
      })
        .then(resolve)
        .catch(reject)
    })
}

export function start(app: PutApp): void {
  app.registerActionHandler = registerActionHandler
  app.deRegisterActionHandler = deRegisterActionHandler

  app.delete(apiPathPrefix + '*', function (req: SkRequest, res: Response) {
    const parsed = parseRequestPath(req.path)
    if (!parsed) {
      res.status(400).send('invalid path')
      return
    }

    respondToParsedRequest(
      res,
      deletePath(app, parsed.context, parsed.skpath, req)
    )
  })

  app.put(apiPathPrefix + '*', function (req: SkRequest, res: Response) {
    const value = req.body as PutBody

    if (value.value === undefined) {
      res.status(400).send('input is missing a value')
      return
    }

    const parsed = parseRequestPath(req.path)
    if (!parsed) {
      res.status(400).send('invalid path')
      return
    }

    respondToParsedRequest(
      res,
      putPath(app, parsed.context, parsed.skpath, value, req)
    )
  })

  putMetaHandler = (context, path, value, cb) => {
    const parts = path.split('.')
    let metaPath = path
    let metaValue = value as Record<string, unknown>

    if (parts[parts.length - 1] !== 'meta') {
      const name = parts[parts.length - 1]
      metaPath = parts.slice(0, parts.length - 2).join('.')

      metaValue = {
        ...app.config.baseDeltaEditor.getMeta(context, metaPath),
        [name]: value
      }
    } else {
      metaPath = parts.slice(0, parts.length - 1).join('.')
    }

    const displayUnits = metaValue.displayUnits as
      | { category?: string }
      | undefined
    if (displayUnits?.category) {
      const schemaMeta = getMetadata('vessels.self.' + metaPath) as Record<
        string,
        unknown
      > | null
      // Allow override: use PUT's units if provided, otherwise use schema's units
      const pathSiUnit =
        (metaValue.units as string | undefined) ||
        (schemaMeta?.units as string | undefined)
      const validationError = validateCategoryAssignment(
        pathSiUnit,
        displayUnits.category
      )
      if (validationError) {
        return {
          state: 'COMPLETED',
          statusCode: 400,
          message: validationError
        }
      }
    }

    // Empty zones array is persisted as null so consumers see a cleared value.
    for (const prop of Object.keys(metaValue)) {
      if (
        Array.isArray(metaValue[prop]) &&
        (metaValue[prop] as unknown[]).length === 0
      ) {
        metaValue[prop] = null
      }
    }

    const previousMeta = app.config.baseDeltaEditor.getMeta(context, metaPath)
    app.config.baseDeltaEditor.setMeta(context, metaPath, metaValue)

    // Remove fields that were deleted from the in-memory metadata registry
    // so they don't get re-injected via the spread below
    const full_meta = getMetadata('vessels.self.' + metaPath) as Record<
      string,
      unknown
    >
    if (previousMeta && full_meta) {
      for (const key of Object.keys(previousMeta)) {
        if (!(key in metaValue)) {
          delete full_meta[key]
        }
      }
    }

    app.handleMessage('defaults', {
      context: 'vessels.self' as Context,
      updates: [
        {
          meta: [
            {
              path: metaPath as Path,
              value: { ...full_meta, ...metaValue }
            }
          ]
        }
      ]
    })

    if (app.config.hasOldDefaults) {
      let data: Record<string, unknown>

      try {
        data = skConfig.readDefaultsFile(app as unknown as ConfigApp) as Record<
          string,
          unknown
        >
      } catch (e) {
        if ((e as NodeJS.ErrnoException).code === 'ENOENT') {
          data = {}
        } else {
          console.error(e)
          cb({ state: 'FAILURE', message: 'Unable to read defaults file' })
          return
        }
      }

      const pathWithContext = context + '.' + path
      setByDottedPath(data, pathWithContext, value)

      skConfig.writeDefaultsFile(
        app as unknown as ConfigApp,
        data,
        (err: Error | null) => {
          if (err) {
            cb({ state: 'FAILURE', message: 'Unable to save to defaults file' })
          } else {
            cb({ state: 'SUCCESS' })
          }
        }
      )
    } else {
      skConfig
        .writeBaseDeltasFile(app as unknown as ConfigApp)
        .then(() => {
          cb({ state: 'SUCCESS' })
        })
        .catch(() => {
          cb({ state: 'FAILURE', message: 'Unable to save to defaults file' })
        })
    }

    return { state: 'PENDING' }
  }

  deleteMetaHandler = (context, path, cb) => {
    const parts = path.split('.')
    let metaPath = path
    let full_meta: Record<string, unknown>

    if (parts[parts.length - 1] !== 'meta') {
      const name = parts[parts.length - 1]
      metaPath = parts.slice(0, parts.length - 2).join('.')

      const metaValue: Record<string, unknown> = {
        ...app.config.baseDeltaEditor.getMeta(context, metaPath)
      }

      if (metaValue[name] === undefined) {
        return { state: 'COMPLETED', statusCode: 404 }
      }

      delete metaValue[name]

      full_meta = getMetadata('vessels.self.' + metaPath) as Record<
        string,
        unknown
      >
      delete full_meta[name]

      app.config.baseDeltaEditor.setMeta(context, metaPath, metaValue)

      if (Object.keys(metaValue).length === 0) {
        app.config.baseDeltaEditor.removeMeta(context, metaPath)
      }
    } else {
      metaPath = parts.slice(0, parts.length - 1).join('.')

      full_meta = getMetadata('vessels.self.' + metaPath) as Record<
        string,
        unknown
      >
      const metaValue = app.config.baseDeltaEditor.getMeta(context, metaPath)

      if (!metaValue) {
        return { state: 'COMPLETED', statusCode: 404 }
      }

      for (const key of Object.keys(metaValue)) {
        delete full_meta[key]
      }

      app.config.baseDeltaEditor.removeMeta(context, metaPath)
    }

    app.handleMessage('defaults', {
      context: 'vessels.self' as Context,
      updates: [
        {
          meta: [
            {
              path: metaPath as Path,
              value: full_meta
            }
          ]
        }
      ]
    })

    skConfig
      .writeBaseDeltasFile(app as unknown as ConfigApp)
      .then(() => {
        cb({ state: 'COMPLETED', statusCode: 200 })
      })
      .catch(() => {
        cb({
          state: 'COMPLETED',
          statusCode: 502,
          message: 'Unable to save to defaults file'
        })
      })

    return { state: 'PENDING' }
  }

  putNotificationHandler = (context, path, value) => {
    return putNotification(app, context, path, value)
  }
}

export function deletePath(
  app: PathApp,
  contextParam: string | null,
  path: string,
  req?: SkRequest | null,
  requestId?: string | null,
  updateCb?: (reply: Reply) => void
): Promise<Reply> {
  const context = contextParam || 'vessels.self'
  debug('received delete %s %s', context, path)
  return new Promise((resolve, reject) => {
    createRequest(
      app,
      'delete',
      {
        context: context,
        requestId: requestId ?? undefined,
        delete: { path: path }
      },
      req && req.skPrincipal ? req.skPrincipal.identifier : undefined,
      undefined,
      updateCb
    )
      .then((request) => {
        if (
          req &&
          app.securityStrategy.shouldAllowPut(req, context, null, path) ===
            false
        ) {
          updateRequest(request.requestId, 'COMPLETED', { statusCode: 403 })
            .then(resolve)
            .catch(reject)
          return
        }

        const parts = path.split('.')
        const handler = isMetaPath(parts) ? deleteMetaHandler : undefined

        if (!handler) {
          updateRequest(request.requestId, 'COMPLETED', {
            statusCode: 405,
            message: `DELETE not supported for ${path}`
          })
            .then(resolve)
            .catch(reject)
          return
        }

        const actionResult = handler(context, path, (reply) => {
          if (debug.enabled) {
            debug('got result: %j', reply)
          }
          updateRequest(request.requestId, reply.state as RequestState, reply)
            .then(() => undefined)
            .catch((err) => {
              console.error(err)
            })
        })

        handleActionResult(request, actionResult, false, resolve, reject)
      })
      .catch(reject)
  })
}

export function putPath(
  app: PathApp,
  contextParam: string | null,
  path: string,
  body: PutBody,
  req?: SkRequest | null,
  requestId?: string | null,
  updateCb?: (reply: Reply) => void
): Promise<Reply> {
  const context = contextParam || 'vessels.self'
  debug('received put %s %s %j', context, path, body)
  return new Promise((resolve, reject) => {
    createRequest(
      app,
      'put',
      {
        context: context,
        requestId: requestId ?? undefined,
        put: { path: path, value: body.value }
      },
      req && req.skPrincipal ? req.skPrincipal.identifier : undefined,
      undefined,
      updateCb
    )
      .then((request) => {
        if (
          req &&
          app.securityStrategy.shouldAllowPut(req, context, null, path) ===
            false
        ) {
          updateRequest(request.requestId, 'COMPLETED', { statusCode: 403 })
            .then(resolve)
            .catch(reject)
          return
        }

        const parts = path.split('.')
        let handler: ActionHandler | undefined

        if (isMetaPath(parts)) {
          handler = putMetaHandler
        } else {
          const handlers = actionHandlers[context]
            ? actionHandlers[context][path]
            : null

          if (handlers) {
            const sources = Object.keys(handlers)
            if (sources.length > 0) {
              if (body.source) {
                handler = handlers[body.source]
              } else if (sources.length === 1) {
                handler = handlers[sources[0]]
              } else {
                updateRequest(request.requestId, 'COMPLETED', {
                  statusCode: 400,
                  message:
                    'there are multiple sources for the given path, but no source was specified in the request'
                })
                  .then(resolve)
                  .catch(reject)
                return
              }
            }
          }

          if (!handler && parts[0] === 'notifications') {
            handler = putNotificationHandler
          }
        }

        if (handler) {
          const actionResult = handler(context, path, body.value, (reply) => {
            if (debug.enabled) {
              debug('got result: %j', reply)
            }
            fixReply(reply)
            updateRequest(request.requestId, reply.state as RequestState, reply)
              .then(() => undefined)
              .catch((err) => {
                console.error(err)
              })
          })

          handleActionResult(request, actionResult, true, resolve, reject)
          return
        }

        if (
          app.interfaces.ws &&
          app.interfaces.ws.canHandlePut(path, body.source)
        ) {
          app.interfaces.ws
            .handlePut(
              request.requestId,
              context,
              path,
              body.source,
              body.value
            )
            .then(resolve)
            .catch(reject)
          return
        }

        updateRequest(request.requestId, 'COMPLETED', {
          statusCode: 405,
          message: `PUT not supported for ${path}`
        })
          .then(resolve)
          .catch(reject)
      })
      .catch(reject)
  })
}

export function registerActionHandler(
  context: string,
  path: string,
  source: string,
  callback: ActionHandler
): () => void {
  if (debug.enabled) {
    debug(`registered action handler for ${context} ${path} ${source}`)
  }

  if (actionHandlers[context] === undefined) {
    actionHandlers[context] = {}
  }
  if (actionHandlers[context][path] === undefined) {
    actionHandlers[context][path] = {}
  }
  actionHandlers[context][path][source] = callback

  return () => {
    deRegisterActionHandler(context, path, source, callback)
  }
}

export function deRegisterActionHandler(
  context: string,
  path: string,
  source: string,
  callback: ActionHandler
): void {
  if (
    actionHandlers[context] &&
    actionHandlers[context][path][source] === callback
  ) {
    delete actionHandlers[context][path][source]
    if (debug.enabled) {
      debug(`de-registered action handler for ${context} ${path} ${source}`)
    }
  }
}

function putNotification(
  app: NotificationApp,
  context: string,
  path: string,
  value: unknown
): ActionResult {
  const parts = path.split('.')
  const notifPath = parts.slice(0, parts.length - 1).join('.')
  const key = parts[parts.length - 1]

  const existing = getByDottedPath(
    app.signalk.self as unknown as Record<string, unknown>,
    notifPath
  ) as
    | { value: Record<string, unknown>; $source: string; timestamp?: string }
    | undefined

  if (existing === undefined || !existing.value) {
    return { state: 'COMPLETED', statusCode: 404 }
  }

  if (key !== 'method' && key !== 'state') {
    return { state: 'COMPLETED', statusCode: 405 }
  }

  existing.value[key] = value
  existing.timestamp = new Date().toISOString()

  app.handleMessage('server', {
    updates: [
      {
        $source: existing.$source as SourceRef,
        values: [
          {
            path: notifPath as Path,
            value: existing.value
          }
        ]
      }
    ]
  })

  return { state: 'COMPLETED', statusCode: 200 }
}
