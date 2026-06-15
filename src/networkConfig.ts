/*
 * Copyright 2026 Signal K contributors
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

import { Agent, setGlobalDispatcher } from 'undici'

// Node >= 20 enables Happy Eyeballs (autoSelectFamily) for outgoing
// connections and caps each per-address connect attempt at 250 ms. On
// high-latency links (cellular/satellite at sea) the SYN round-trip to
// app-store hosts (signalk.org, registry.npmjs.org, api.github.com, the
// jsDelivr/unpkg CDNs) routinely exceeds 250 ms, so every attempt aborts
// and the request fails instantly regardless of any AbortController
// timeout above it. The symptom is an app store that is intermittently
// "offline". Raising the per-attempt timeout keeps the IPv6->IPv4
// fallback while giving slow links room to complete the handshake.
const CONNECT_ATTEMPT_TIMEOUT_MS = 5000

setGlobalDispatcher(
  new Agent({
    connect: {
      autoSelectFamily: true,
      autoSelectFamilyAttemptTimeout: CONNECT_ATTEMPT_TIMEOUT_MS
    }
  })
)
