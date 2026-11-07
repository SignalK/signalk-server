/*
 * Copyright 2026 Signal K contributors
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 */

import { uniqBy } from 'lodash'
import { WEB_MOUNT_KEYWORDS } from '../interfaces/webapps'
import { findModulesWithKeyword } from '../modules'
import { NODE_PLUGIN_KEYWORD } from './plugin-keywords'

// Comes with the server, so the App Store does not offer it
export const BUNDLED_ADMIN_UI = '@signalk/server-admin-ui'

/** The npm packages the App Store lists; rejects when npm can't say. */
export async function findAppStoreModules() {
  const [plugins, embeddableWebapps, webapps] = await Promise.all([
    findModulesWithKeyword(NODE_PLUGIN_KEYWORD),
    findModulesWithKeyword(WEB_MOUNT_KEYWORDS.embeddablewebapps),
    findModulesWithKeyword(WEB_MOUNT_KEYWORDS.webapps)
  ])
  return {
    plugins,
    webapps: uniqBy(
      [...embeddableWebapps, ...webapps].filter(
        (module) => module.package.name !== BUNDLED_ADMIN_UI
      ),
      (module) => module.package.name
    )
  }
}
