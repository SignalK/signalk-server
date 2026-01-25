import { Request, Response, Application } from 'express'
import { Context, Path, SourceRef } from '@signalk/server-api'
import { get as _get, set as _set } from 'lodash'
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

const actionHandlers: ActionHandlers = {}
let putMetaHandler: ActionHandler
let deleteMetaHandler: DeleteHandler
let putNotificationHandler: (
  context: string,
  path: string,
  value: unknown
) => ActionResult

export function start(app: PutApp): void {
  app.registerActionHandler = registerActionHandler
  app.deRegisterActionHandler = deRegisterActionHandler

  app.delete(apiPathPrefix + '*', function (req: SkRequest, res: Response) {
    let path = String(req.path).replace(apiPathPrefix, '')

    path = path.replace(/\/$/, '').replace(/\//g, '.')

    const parts = path.length > 0 ? path.split('.') : []

    if (parts.length < 3) {
      res.status(400).send('invalid path')
      return
    }

    const context = `${parts[0]}.${parts[1]}`
    const skpath = parts.slice(2).join('.')

    deletePath(app, context, skpath, req)
      .then((reply) => {
        res.status(reply.statusCode)
        res.json(reply)
      })
      .catch((err) => {
        console.error(err)
        res.status(500).send(err.message)
      })
  })

  app.put(apiPathPrefix + '*', function (req: SkRequest, res: Response) {
    let path = String(req.path).replace(apiPathPrefix, '')

    const value = req.body as PutBody

    if (value.value === undefined) {
      res.status(400).send('input is missing a value')
      return
    }

    path = path.replace(/\/$/, '').replace(/\//g, '.')

    const parts = path.length > 0 ? path.split('.') : []

    if (parts.length < 3) {
      res.status(400).send('invalid path')
      return
    }

    const context = `${parts[0]}.${parts[1]}`
    const skpath = parts.slice(2).join('.')

    putPath(app, context, skpath, value, req)
      .then((reply) => {
        res.status(reply.statusCode)
        res.json(reply)
      })
      .catch((err) => {
        console.error(err)
        res.status(500).send(err.message)
      })
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

    for (const prop in metaValue) {
      if (
        Array.isArray(metaValue[prop]) &&
        (metaValue[prop] as unknown[]).length === 0
      ) {
        metaValue[prop] = null
      }
    }

    app.config.baseDeltaEditor.setMeta(context, metaPath, metaValue)

    const full_meta = getMetadata('vessels.self.' + metaPath) as Record<
      string,
      unknown
    >

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
      _set(data, pathWithContext, value)

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

      if (typeof metaValue[name] === 'undefined') {
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

      Object.keys(metaValue).forEach((key) => {
        delete full_meta[key]
      })

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
        let handler: DeleteHandler | undefined

        if (
          (parts.length > 1 && parts[parts.length - 1] === 'meta') ||
          (parts.length > 1 && parts[parts.length - 2] === 'meta')
        ) {
          handler = deleteMetaHandler
        }

        if (handler) {
          const actionResult = handler(context, path, (reply) => {
            debug('got result: %j', reply)
            updateRequest(request.requestId, reply.state as RequestState, reply)
              .then(() => undefined)
              .catch((err) => {
                console.error(err)
              })
          })

          Promise.resolve(actionResult)
            .then((result) => {
              debug('got result: %j', result)
              updateRequest(
                request.requestId,
                result!.state as RequestState,
                result!
              )
                .then((reply) => {
                  if (reply.state === 'PENDING') {
                    ;(reply as Reply & { action?: { href: string } }).action = {
                      href: reply.href
                    }
                  }
                  resolve(reply)
                })
                .catch(reject)
            })
            .catch((err) => {
              updateRequest(request.requestId, 'COMPLETED', {
                statusCode: 500,
                message: err.message
              })
                .then(resolve)
                .catch(reject)
            })
        } else {
          updateRequest(request.requestId, 'COMPLETED', {
            statusCode: 405,
            message: `DELETE not supported for ${path}`
          })
            .then(resolve)
            .catch(reject)
        }
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

        let handler: ActionHandler | undefined
        const parts = path.split('.')

        if (
          (parts.length > 1 && parts[parts.length - 1] === 'meta') ||
          (parts.length > 1 && parts[parts.length - 2] === 'meta')
        ) {
          handler = putMetaHandler
        } else {
          const handlers = actionHandlers[context]
            ? actionHandlers[context][path]
            : null

          if (handlers && Object.keys(handlers).length > 0) {
            if (body.source) {
              handler = handlers[body.source]
            } else if (Object.keys(handlers).length === 1) {
              handler = Object.values(handlers)[0]
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

          if (!handler && parts[0] === 'notifications') {
            handler = putNotificationHandler
          }
        }

        if (handler) {
          function fixReply(reply: ActionResult): void {
            if (reply.state === 'FAILURE') {
              reply.state = 'COMPLETED'
              reply.statusCode = 502
            } else if (reply.state === 'SUCCESS') {
              reply.state = 'COMPLETED'
              reply.statusCode = 200
            }
          }

          const actionResult = handler(context, path, body.value, (reply) => {
            debug('got result: %j', reply)
            fixReply(reply)
            updateRequest(request.requestId, reply.state as RequestState, reply)
              .then(() => undefined)
              .catch((err) => {
                console.error(err)
              })
          })

          Promise.resolve(actionResult)
            .then((result) => {
              debug('got result: %j', result)
              fixReply(result!)
              updateRequest(
                request.requestId,
                result!.state as RequestState,
                result!
              )
                .then((reply) => {
                  if (reply.state === 'PENDING') {
                    ;(reply as Reply & { action?: { href: string } }).action = {
                      href: reply.href
                    }
                  }
                  resolve(reply)
                })
                .catch(reject)
            })
            .catch((err) => {
              updateRequest(request.requestId, 'COMPLETED', {
                statusCode: 500,
                message: err.message
              })
                .then(resolve)
                .catch(reject)
            })
        } else if (
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
        } else {
          updateRequest(request.requestId, 'COMPLETED', {
            statusCode: 405,
            message: `PUT not supported for ${path}`
          })
            .then(resolve)
            .catch(reject)
        }
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
  debug(`registered action handler for ${context} ${path} ${source}`)

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
    debug(`de-registered action handler for ${context} ${path} ${source}`)
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

  const existing = _get(app.signalk.self, notifPath) as
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

  const delta = {
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
  }
  app.handleMessage('server', delta)

  return { state: 'COMPLETED', statusCode: 200 }
}
