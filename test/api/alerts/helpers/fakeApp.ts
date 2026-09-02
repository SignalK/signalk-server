import type { Request, Response } from 'express'
import type { Delta } from '@signalk/server-api'

export type RouteHandler = (req: Request, res: Response) => unknown

/**
 * The parts of the server application the alerts API touches, recording the
 * routes it registers so a test can call them without an HTTP server.
 */
export class FakeApp {
  readonly routes = new Map<string, RouteHandler>()
  /** Deltas the API published, with the provider id it published them under */
  readonly published: Array<{ id: string; delta: Delta }> = []
  /**
   * Every delta input handler still registered, in registration order.
   *
   * A list rather than one field, because the server stacks handlers on a
   * chain: a fake that replaced its handler would hide a restart that leaks
   * the previous one.
   */
  readonly deltaInputHandlers: Array<
    (delta: Delta, next: (delta: Delta) => void) => void
  > = []
  config: { configPath: string; settings: Record<string, unknown> }
  selfContext = 'vessels.urn:mrn:signalk:uuid:test-self'

  constructor(configPath: string) {
    this.config = { configPath, settings: {} }
  }

  get(route: string, handler: RouteHandler) {
    this.routes.set(`GET ${route}`, handler)
  }
  post(route: string, handler: RouteHandler) {
    this.routes.set(`POST ${route}`, handler)
  }
  put(route: string, handler: RouteHandler) {
    this.routes.set(`PUT ${route}`, handler)
  }
  delete(route: string, handler: RouteHandler) {
    this.routes.set(`DELETE ${route}`, handler)
  }

  handleMessage(id: string, delta: Delta) {
    this.published.push({ id, delta })
  }

  registerDeltaInputHandler(
    handler: (delta: Delta, next: (delta: Delta) => void) => void
  ): () => void {
    this.deltaInputHandlers.push(handler)
    return () => {
      const at = this.deltaInputHandlers.indexOf(handler)
      if (at >= 0) {
        this.deltaInputHandlers.splice(at, 1)
      }
    }
  }

  /** Feed a delta through the registered handlers, as the server would. */
  ingest(delta: Delta): Delta[] {
    if (this.deltaInputHandlers.length === 0) {
      throw new Error('no delta input handler registered')
    }
    const passed: Delta[] = []
    const chain = (at: number, current: Delta): void => {
      const handler = this.deltaInputHandlers[at]
      if (!handler) {
        passed.push(current)
        return
      }
      handler(current, (next) => {
        chain(at + 1, next)
      })
    }
    chain(0, delta)
    return passed
  }
}

/** What a route replied: the status it set and the body it sent. */
export interface Reply {
  status: number
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  body: any
}

/** Call a registered route, waiting for the reply it sends. */
export async function callRoute(
  app: FakeApp,
  route: string,
  options: {
    params?: Record<string, string>
    query?: Record<string, unknown>
    body?: unknown
  } = {}
): Promise<Reply> {
  const handler = app.routes.get(route)
  if (!handler) {
    throw new Error(
      `no route ${route}; registered: ${Array.from(app.routes.keys()).join(', ')}`
    )
  }

  let settle: (reply: Reply) => void
  const replied = new Promise<Reply>((resolve) => {
    settle = resolve
  })
  let status = 200
  const res = {
    status(code: number) {
      status = code
      return this
    },
    json(body: unknown) {
      settle({ status, body })
      return this
    },
    // Without these a status-only reply either throws for a missing method or
    // never settles, and the test times out instead of reporting the route.
    send(body?: unknown) {
      settle({ status, body })
      return this
    },
    end() {
      settle({ status, body: undefined })
      return this
    },
    sendStatus(code: number) {
      status = code
      settle({ status, body: undefined })
      return this
    }
  }
  const req = {
    method: route.split(' ')[0],
    path: route.split(' ')[1],
    params: options.params ?? {},
    query: options.query ?? {},
    body: options.body ?? {}
  }
  await handler(req as unknown as Request, res as unknown as Response)
  return replied
}
