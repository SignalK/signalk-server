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

import { Static, Type } from '@sinclair/typebox'

// requestId is a server-generated UUID. Enforcing that shape stops a crafted id
// from being interpolated into the remote request path as a traversal sequence.
const UUID_PATTERN =
  '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$'

// 1-65535 expressed as a string, since the admin UI sends port as a string.
const PORT_STRING_PATTERN =
  '^([1-9]\\d{0,3}|[1-5]\\d{4}|6[0-4]\\d{3}|65[0-4]\\d{2}|655[0-2]\\d|6553[0-5])$'

// The admin UI sends port as a string, so accept a number or a numeric string,
// range-checked either way.
const remoteServerProps = {
  host: Type.String({ minLength: 1 }),
  port: Type.Union([
    Type.Integer({ minimum: 1, maximum: 65535 }),
    Type.String({ pattern: PORT_STRING_PATTERN })
  ]),
  useTLS: Type.Optional(Type.Boolean()),
  selfsignedcert: Type.Optional(Type.Boolean())
}

export const testConnectionSchema = Type.Object({
  ...remoteServerProps,
  token: Type.Optional(Type.String())
})

export const requestAccessSchema = Type.Object({
  ...remoteServerProps,
  clientId: Type.Optional(Type.String()),
  description: Type.Optional(Type.String())
})

export const checkAccessRequestSchema = Type.Object({
  ...remoteServerProps,
  requestId: Type.String({ pattern: UUID_PATTERN })
})

export type TestConnectionBody = Static<typeof testConnectionSchema>
export type RequestAccessBody = Static<typeof requestAccessSchema>
export type CheckAccessRequestBody = Static<typeof checkAccessRequestSchema>
