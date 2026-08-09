import type { StateCreator } from 'zustand'
import { Check } from 'typebox/value'
import {
  mergeLastUsed,
  WEBAPP_SORT_MODES,
  WebappCustomOrderSchema,
  WebappLastUsedSchema,
  WebappSortDocSchema,
  type WebappSortDoc,
  type WebappSortMode
} from '../../utils/webappSort'
import {
  readJson,
  readString,
  writeJson,
  writeString
} from '../../utils/safeLocalStorage'

export const WEBAPP_SORT_MODE_KEY = 'signalk.webapps.sortMode'
export const WEBAPP_CUSTOM_ORDER_KEY = 'signalk.webapps.customOrder'
export const WEBAPP_LAST_USED_KEY = 'signalk.webapps.lastUsed'

const APPLICATION_DATA_URL =
  '/signalk/v1/applicationData/user/webapp-sort/1.0.0'

export interface WebappSortSliceState {
  webappSortMode: WebappSortMode
  webappCustomOrder: string[]
  webappLastUsed: Record<string, number>
  // applicationData reachable this session (security enabled and the GET
  // in initWebappSort answered) — gates the fire-and-forget POSTs.
  webappSortSynced: boolean
}

export interface WebappSortSliceActions {
  initWebappSort: () => Promise<void>
  setWebappSortMode: (mode: WebappSortMode) => void
  setWebappCustomOrder: (order: string[]) => void
  recordWebappLaunch: (name: string) => void
}

export type WebappSortSlice = WebappSortSliceState & WebappSortSliceActions

// localStorage survives server restarts (it lives in the browser) and is
// the always-available store; applicationData adds cross-device sync per
// user but is disabled entirely on servers without security.
function readLocalDoc(): WebappSortDoc {
  const rawOrder = readJson(WEBAPP_CUSTOM_ORDER_KEY)
  const rawLastUsed = readJson(WEBAPP_LAST_USED_KEY)
  return {
    sortMode: readString(WEBAPP_SORT_MODE_KEY, WEBAPP_SORT_MODES, 'name'),
    customOrder: Check(WebappCustomOrderSchema, rawOrder) ? rawOrder : [],
    lastUsed: Check(WebappLastUsedSchema, rawLastUsed) ? rawLastUsed : {}
  }
}

function writeLocalDoc(doc: WebappSortDoc): void {
  writeString(WEBAPP_SORT_MODE_KEY, doc.sortMode)
  writeJson(WEBAPP_CUSTOM_ORDER_KEY, doc.customOrder)
  writeJson(WEBAPP_LAST_USED_KEY, doc.lastUsed)
}

interface ServerDocResult {
  // false when applicationData is not usable this session, so POSTs are
  // pointless: with security off the routes are not even mounted (GET
  // falls through to a 404), without a login the GET is a 401.
  available: boolean
  doc?: WebappSortDoc
}

async function fetchServerDoc(): Promise<ServerDocResult> {
  try {
    const res = await fetch(APPLICATION_DATA_URL, { credentials: 'include' })
    if (!res.ok) {
      return { available: false }
    }
    const data: unknown = await res.json()
    // A whole-doc GET answers 200 with {} when nothing is stored yet; a
    // malformed or partial doc (e.g. written by a future version) is
    // treated the same — absent rather than trusted.
    return {
      available: true,
      doc: Check(WebappSortDocSchema, data) ? data : undefined
    }
  } catch {
    return { available: false }
  }
}

function postServerDoc(doc: WebappSortDoc): void {
  fetch(APPLICATION_DATA_URL, {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(doc)
  })
    .then((res) => {
      if (!res.ok) {
        console.debug('webapp-sort sync rejected:', res.status)
      }
    })
    .catch((err) => console.debug('webapp-sort sync failed:', err))
}

export const createWebappSortSlice: StateCreator<
  WebappSortSlice,
  [],
  [],
  WebappSortSlice
> = (set, get) => {
  const initial = readLocalDoc()
  return {
    webappSortMode: initial.sortMode,
    webappCustomOrder: initial.customOrder,
    webappLastUsed: initial.lastUsed,
    webappSortSynced: false,

    initWebappSort: async () => {
      const local = readLocalDoc()
      set({
        webappSortMode: local.sortMode,
        webappCustomOrder: local.customOrder,
        webappLastUsed: local.lastUsed
      })

      const server = await fetchServerDoc()
      if (!server.available) return

      // The user may have changed mode/order or launched a webapp while
      // the GET was in flight — those newer edits win over the server copy.
      const current = get()
      const merged: WebappSortDoc = {
        sortMode:
          current.webappSortMode !== local.sortMode
            ? current.webappSortMode
            : (server.doc?.sortMode ?? local.sortMode),
        customOrder:
          current.webappCustomOrder !== local.customOrder
            ? current.webappCustomOrder
            : (server.doc?.customOrder ?? local.customOrder),
        lastUsed: mergeLastUsed(
          mergeLastUsed(local.lastUsed, current.webappLastUsed),
          server.doc?.lastUsed ?? {}
        )
      }

      set({
        webappSortMode: merged.sortMode,
        webappCustomOrder: merged.customOrder,
        webappLastUsed: merged.lastUsed,
        webappSortSynced: true
      })
      writeLocalDoc(merged)
      // Push local knowledge (e.g. launches recorded while the server
      // copy was elsewhere) up to the server. Key-order differences can
      // cause a redundant POST; the write is idempotent so that is
      // harmless.
      if (JSON.stringify(server.doc) !== JSON.stringify(merged)) {
        postServerDoc(merged)
      }
    },

    setWebappSortMode: (mode) => {
      set({ webappSortMode: mode })
      const { webappCustomOrder, webappLastUsed, webappSortSynced } = get()
      const doc: WebappSortDoc = {
        sortMode: mode,
        customOrder: webappCustomOrder,
        lastUsed: webappLastUsed
      }
      writeLocalDoc(doc)
      if (webappSortSynced) postServerDoc(doc)
    },

    setWebappCustomOrder: (order) => {
      set({ webappCustomOrder: order })
      const { webappSortMode, webappLastUsed, webappSortSynced } = get()
      const doc: WebappSortDoc = {
        sortMode: webappSortMode,
        customOrder: order,
        lastUsed: webappLastUsed
      }
      writeLocalDoc(doc)
      if (webappSortSynced) postServerDoc(doc)
    },

    // localStorage only: the click navigates away immediately, so the
    // synchronous write is all that reliably completes. The server copy
    // catches up via the merge in initWebappSort on the next visit.
    recordWebappLaunch: (name) => {
      const lastUsed = { ...get().webappLastUsed, [name]: Date.now() }
      set({ webappLastUsed: lastUsed })
      writeJson(WEBAPP_LAST_USED_KEY, lastUsed)
    }
  }
}
