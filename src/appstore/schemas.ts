/*
 * Copyright 2026 Signal K contributors
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 */

import { type Static, Type } from '@sinclair/typebox'

export const IndicatorStatusSchema = Type.Union(
  [Type.Literal('ok'), Type.Literal('warn'), Type.Literal('fail')],
  { $id: 'AppStoreIndicatorStatus' }
)
export type IndicatorStatus = Static<typeof IndicatorStatusSchema>

export const IndicatorCheckSchema = Type.Object(
  {
    id: Type.String(),
    status: IndicatorStatusSchema,
    title: Type.String(),
    subtitle: Type.String(),
    // True when no signal was available to evaluate the check. The UI
    // renders these neutrally (not as a green pass) and the scoring
    // layer excludes them from the weighted average so missing signals
    // don't inflate the composite.
    unknown: Type.Optional(Type.Boolean())
  },
  {
    $id: 'AppStoreIndicatorCheck',
    description:
      'One heuristic check contributing to the App Store indicator score.'
  }
)
export type IndicatorCheck = Static<typeof IndicatorCheckSchema>

export const IndicatorRawMetricsSchema = Type.Object(
  {
    stars: Type.Optional(Type.Number()),
    downloadsPerWeek: Type.Optional(Type.Number()),
    openIssues: Type.Optional(Type.Number()),
    contributors: Type.Optional(Type.Number()),
    lastReleaseDate: Type.Optional(Type.String())
  },
  {
    $id: 'AppStoreIndicatorRawMetrics',
    description: 'Raw informational metrics shown on the Indicators tab.'
  }
)
export type IndicatorRawMetrics = Static<typeof IndicatorRawMetricsSchema>

export const IndicatorResultSchema = Type.Object(
  {
    score: Type.Number({ minimum: 0, maximum: 100 }),
    checks: Type.Array(IndicatorCheckSchema),
    rawMetrics: IndicatorRawMetricsSchema
  },
  {
    $id: 'AppStoreIndicatorResult',
    description:
      'Aggregate heuristic indicator result. Weights are not exposed.'
  }
)
export type IndicatorResult = Static<typeof IndicatorResultSchema>

// plugin-ci matrix: per-platform pass/fail of the upstream
// SignalK/signalk-server/.github/workflows/plugin-ci.yml against the
// commit (npm gitHead) the published version was built from. Fetched
// once per nightly by the signalk-plugin-registry CI under the
// authenticated GITHUB_TOKEN; surfaced on the App Store Indicators tab.
// Discriminated union by `status` so the UI never has to disambiguate
// "not yet fetched" from "fetched, nothing found".
export const PluginCiPlatformSchema = Type.Union([
  Type.Literal('linux-x64'),
  Type.Literal('linux-arm64'),
  Type.Literal('macos'),
  Type.Literal('windows'),
  Type.Literal('armv7-cerbo'),
  Type.Literal('integration'),
  // Future-proof: registry may emit new platforms before the admin UI
  // ships a label for them.
  Type.String()
])
export type PluginCiPlatform = Static<typeof PluginCiPlatformSchema>

export const PluginCiConclusionSchema = Type.Union([
  Type.Literal('success'),
  Type.Literal('failure'),
  Type.Literal('skipped'),
  Type.Literal('cancelled'),
  Type.Literal('in_progress'),
  Type.Null()
])
export type PluginCiConclusion = Static<typeof PluginCiConclusionSchema>

export const PluginCiJobSchema = Type.Object({
  platform: PluginCiPlatformSchema,
  node: Type.Number(),
  conclusion: PluginCiConclusionSchema,
  server_version: Type.Optional(Type.String()),
  job_url: Type.Optional(Type.String())
})
export type PluginCiJob = Static<typeof PluginCiJobSchema>

export const PluginCiSchema = Type.Union([
  Type.Object({
    status: Type.Literal('no-githead')
  }),
  Type.Object({
    status: Type.Literal('no-run'),
    head_sha: Type.String(),
    commit_url: Type.String()
  }),
  Type.Object({
    status: Type.Literal('no-plugin-ci'),
    head_sha: Type.String(),
    workflow_run_url: Type.String()
  }),
  Type.Object({
    status: Type.Literal('in-progress'),
    head_sha: Type.String(),
    workflow_run_url: Type.String(),
    tested_at: Type.Optional(Type.String())
  }),
  Type.Object({
    status: Type.Literal('ok'),
    head_sha: Type.String(),
    commit_url: Type.String(),
    workflow_run_url: Type.String(),
    tested_at: Type.String(),
    workflow_ref: Type.String(),
    jobs: Type.Array(PluginCiJobSchema)
  })
])
export type PluginCi = Static<typeof PluginCiSchema>

export const SignalKPackageMetadataSchema = Type.Object(
  {
    displayName: Type.Optional(Type.String()),
    appIcon: Type.Optional(Type.String()),
    screenshots: Type.Optional(Type.Array(Type.String())),
    deprecated: Type.Optional(Type.Boolean()),
    requires: Type.Optional(Type.Array(Type.String())),
    recommends: Type.Optional(Type.Array(Type.String()))
  },
  {
    $id: 'SignalKPackageMetadata',
    description:
      'Metadata authors declare under the signalk key in package.json.',
    additionalProperties: true
  }
)
export type SignalKPackageMetadata = Static<typeof SignalKPackageMetadataSchema>

export const DependencyReferenceSchema = Type.Object(
  {
    name: Type.String(),
    displayName: Type.Optional(Type.String()),
    appIcon: Type.Optional(Type.String()),
    installed: Type.Boolean()
  },
  {
    $id: 'AppStoreDependencyReference',
    description:
      'A hydrated reference to another App Store plugin that this plugin ' +
      'requires or recommends.'
  }
)
export type DependencyReference = Static<typeof DependencyReferenceSchema>

export const AppStoreEntryExtensionSchema = Type.Object(
  {
    displayName: Type.Optional(Type.String()),
    appIcon: Type.Optional(Type.String()),
    installedIconUrl: Type.Optional(Type.String()),
    screenshots: Type.Optional(Type.Array(Type.String())),
    installedScreenshotUrls: Type.Optional(Type.Array(Type.String())),
    official: Type.Boolean(),
    deprecated: Type.Boolean(),
    readmeUrl: Type.String(),
    changelogUrl: Type.Optional(Type.String()),
    githubUrl: Type.Optional(Type.String()),
    issuesUrl: Type.Optional(Type.String()),
    requires: Type.Optional(Type.Array(Type.String())),
    recommends: Type.Optional(Type.Array(Type.String())),
    indicators: Type.Optional(IndicatorResultSchema),
    pluginCi: Type.Optional(PluginCiSchema)
  },
  {
    $id: 'AppStoreEntryExtension',
    description: 'Extra fields enriched onto each App Store list entry.'
  }
)
export type AppStoreEntryExtension = Static<typeof AppStoreEntryExtensionSchema>

export const PluginDetailPayloadSchema = Type.Object(
  {
    name: Type.String(),
    version: Type.String(),
    displayName: Type.Optional(Type.String()),
    appIcon: Type.Optional(Type.String()),
    installedIconUrl: Type.Optional(Type.String()),
    screenshots: Type.Array(Type.String()),
    installedScreenshotUrls: Type.Optional(Type.Array(Type.String())),
    official: Type.Boolean(),
    deprecated: Type.Boolean(),
    // Header-display fields. These exist on list entries too, but the
    // detail page must not depend on the list having been hydrated to
    // render its header (a hard refresh of /apps/store/plugin/:name
    // hits this endpoint without a list response in scope).
    description: Type.Optional(Type.String()),
    author: Type.Optional(Type.String()),
    githubUrl: Type.Optional(Type.String()),
    npmUrl: Type.Optional(Type.String()),
    isPlugin: Type.Optional(Type.Boolean()),
    isWebapp: Type.Optional(Type.Boolean()),
    readme: Type.String(),
    changelog: Type.String(),
    indicators: Type.Optional(IndicatorResultSchema),
    pluginCi: Type.Optional(PluginCiSchema),
    requires: Type.Array(DependencyReferenceSchema),
    recommends: Type.Array(DependencyReferenceSchema),
    readmeFormat: Type.Literal('markdown'),
    changelogFormat: Type.Union([
      Type.Literal('markdown'),
      Type.Literal('synthesized')
    ]),
    fetchedAt: Type.Number(),
    fromCache: Type.Boolean()
  },
  {
    $id: 'AppStorePluginDetailPayload',
    description: 'Response body of GET /appstore/plugin/:name.'
  }
)
export type PluginDetailPayload = Static<typeof PluginDetailPayloadSchema>
