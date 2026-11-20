/*
 * Copyright 2026 Signal K project contributors
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 * http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

import { NextFunction, Request, Response } from 'express'
import { isInternetAddress } from './internetAddress'

export const EXPOSURE_STATUS_ID = 'security'
const WARNING_INTERVAL_MS = 60 * 60 * 1000

interface ExposureApp {
  securityStrategy: { isDummy(): boolean }
  setProviderError(providerId: string, errorMessage: string): void
}

export type ClientAddressObserver = (address: string | undefined) => void

// A server without security gives every visitor admin rights, which on the
// internet means anyone can run programs on it. Say so in the log and on the
// dashboard as soon as a client connects from an internet address, over HTTP
// or WebSocket. One observer per server, so both share the hourly limit.
export function createExposureObserver(
  app: ExposureApp
): ClientAddressObserver {
  let lastWarning = -Infinity
  return (address) => {
    if (!app.securityStrategy.isDummy() || !isInternetAddress(address)) {
      return
    }
    const now = Date.now()
    if (now - lastWarning < WARNING_INTERVAL_MS) {
      return
    }
    lastWarning = now
    const message = `Security is not enabled and this server was reached from the internet address ${address}. Anyone who can reach it can change its settings and run programs on it. Enable security and keep the server off the public internet.`
    console.warn(message)
    app.setProviderError(EXPOSURE_STATUS_ID, message)
  }
}

export function observeClientAddresses(observe: ClientAddressObserver) {
  return (req: Request, _res: Response, next: NextFunction) => {
    observe(req.ip)
    next()
  }
}
