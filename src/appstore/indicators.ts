/*
 * Copyright 2026 Signal K contributors
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 */

import { IndicatorCheck, IndicatorRawMetrics, IndicatorResult } from './types'

export interface IndicatorInputs {
  lastReleaseDate?: string
  keywords?: string[]
  description?: string
  readme?: string
  hasScreenshots?: boolean
  hasAppIcon?: boolean
  stars?: number
  downloadsPerWeek?: number
  openIssues?: number
  contributors?: number
  githubUrl?: string
  testsPass?: boolean
  hasRepository?: boolean
}

const WEIGHTS: Record<string, number> = {
  testsPass: 30,
  noCriticalIssues: 20,
  activelyMaintained: 15,
  documentation: 15,
  communityAdoption: 10,
  hasVisualAssets: 10
}

// Per-check thresholds. Pulled out so reviewers can tune the scoring
// rules without touching the rule bodies, and so a future calibration
// pass can see all the dials in one place.
const OPEN_ISSUES_WARN_THRESHOLD = 50
const MAINTENANCE_OK_DAYS = 180
const MAINTENANCE_WARN_DAYS = 365
const README_OK_LENGTH = 2000
const README_WARN_LENGTH = 500
const COMMUNITY_OK_THRESHOLD = 4
const COMMUNITY_WARN_THRESHOLD = 2

const UNKNOWN_SUBTITLE = 'Unable to determine — no signal available'

function neutralCheck(id: string, title: string): IndicatorCheck {
  // Marked unknown so the UI doesn't render a green pass and so the
  // scoring layer excludes it from the denominator.
  return {
    id,
    status: 'warn',
    title,
    subtitle: UNKNOWN_SUBTITLE,
    unknown: true
  }
}

function daysSince(iso: string): number {
  const t = Date.parse(iso)
  if (Number.isNaN(t)) return Number.POSITIVE_INFINITY
  return (Date.now() - t) / (1000 * 60 * 60 * 24)
}

function scoreTestsPass(inputs: IndicatorInputs): IndicatorCheck {
  if (inputs.testsPass === undefined) {
    return neutralCheck('tests-pass', 'Plugin test suite')
  }
  if (inputs.testsPass) {
    return {
      id: 'tests-pass',
      status: 'ok',
      title: 'Plugin test suite',
      subtitle: 'Signal K plugin test suite passes'
    }
  }
  return {
    id: 'tests-pass',
    status: 'fail',
    title: 'Plugin test suite',
    subtitle: 'Plugin test suite is failing or has not run'
  }
}

function scoreCriticalIssues(inputs: IndicatorInputs): IndicatorCheck {
  if (!inputs.hasRepository || inputs.openIssues === undefined) {
    return neutralCheck('no-critical-issues', 'No critical issues')
  }
  if (inputs.openIssues > OPEN_ISSUES_WARN_THRESHOLD) {
    return {
      id: 'no-critical-issues',
      status: 'warn',
      title: 'No critical issues',
      subtitle: `${inputs.openIssues} open issues reported`
    }
  }
  return {
    id: 'no-critical-issues',
    status: 'ok',
    title: 'No critical issues',
    subtitle:
      inputs.openIssues === 0
        ? 'No open issues reported'
        : `${inputs.openIssues} open issues reported`
  }
}

function scoreActivelyMaintained(inputs: IndicatorInputs): IndicatorCheck {
  if (!inputs.lastReleaseDate) {
    return neutralCheck('actively-maintained', 'Actively maintained')
  }
  const days = daysSince(inputs.lastReleaseDate)
  if (days < MAINTENANCE_OK_DAYS) {
    return {
      id: 'actively-maintained',
      status: 'ok',
      title: 'Actively maintained',
      subtitle: `Last release ${Math.floor(days)} days ago`
    }
  }
  if (days < MAINTENANCE_WARN_DAYS) {
    return {
      id: 'actively-maintained',
      status: 'warn',
      title: 'Actively maintained',
      subtitle: `Last release ${Math.floor(days)} days ago`
    }
  }
  return {
    id: 'actively-maintained',
    status: 'fail',
    title: 'Actively maintained',
    subtitle: `Last release ${Math.floor(days)} days ago`
  }
}

function scoreDocumentation(inputs: IndicatorInputs): IndicatorCheck {
  const len = (inputs.readme || '').trim().length
  const hasDesc = !!(inputs.description && inputs.description.trim().length > 0)
  if (len === 0 && !hasDesc) {
    return neutralCheck('documentation', 'Documentation coverage')
  }
  if (len >= README_OK_LENGTH) {
    return {
      id: 'documentation',
      status: 'ok',
      title: 'Documentation coverage',
      subtitle: 'README provides substantial documentation'
    }
  }
  if (len >= README_WARN_LENGTH) {
    return {
      id: 'documentation',
      status: 'warn',
      title: 'Documentation coverage',
      subtitle: 'README is present but brief'
    }
  }
  if (hasDesc) {
    return {
      id: 'documentation',
      status: 'warn',
      title: 'Documentation coverage',
      subtitle: 'Only a package description is available'
    }
  }
  return {
    id: 'documentation',
    status: 'fail',
    title: 'Documentation coverage',
    subtitle: 'No README or description found'
  }
}

function scoreCommunityAdoption(inputs: IndicatorInputs): IndicatorCheck {
  if (inputs.stars === undefined && inputs.downloadsPerWeek === undefined) {
    return neutralCheck('community-adoption', 'Community adoption')
  }
  const stars = inputs.stars ?? 0
  const dl = inputs.downloadsPerWeek ?? 0
  const score = Math.log10(1 + stars) + Math.log10(1 + dl)
  if (score >= COMMUNITY_OK_THRESHOLD) {
    return {
      id: 'community-adoption',
      status: 'ok',
      title: 'Community adoption',
      subtitle: 'Broad community usage'
    }
  }
  // Moderate community usage is intentionally 'ok' (passing), not 'warn'.
  // Most Signal K plugins are niche-by-design (a single sensor driver, a
  // specific autopilot integration) and never hit broad-adoption stars/
  // downloads numbers. Treating moderate adoption as a warning would
  // unfairly penalise the long tail of legitimate niche plugins; the
  // 'broad' tier remains as the upper signal for plugins that did break
  // out. Only the third branch below (score < WARN_THRESHOLD) actually
  // warns.
  if (score >= COMMUNITY_WARN_THRESHOLD) {
    return {
      id: 'community-adoption',
      status: 'ok',
      title: 'Community adoption',
      subtitle: 'Moderate community usage'
    }
  }
  return {
    id: 'community-adoption',
    status: 'warn',
    title: 'Community adoption',
    subtitle: 'Limited or early-stage adoption'
  }
}

function scoreVisualAssets(inputs: IndicatorInputs): IndicatorCheck {
  if (inputs.hasScreenshots || inputs.hasAppIcon) {
    return {
      id: 'visual-assets',
      status: 'ok',
      title: 'Visual assets',
      subtitle: inputs.hasScreenshots
        ? 'Screenshots available'
        : 'App icon provided'
    }
  }
  return {
    id: 'visual-assets',
    status: 'warn',
    title: 'Visual assets',
    subtitle: 'No screenshots or app icon declared'
  }
}

const STATUS_CONTRIBUTION: Record<IndicatorCheck['status'], number> = {
  ok: 1,
  warn: 0.5,
  fail: 0
}

export function computeIndicators(inputs: IndicatorInputs): IndicatorResult {
  const checks: IndicatorCheck[] = [
    scoreTestsPass(inputs),
    scoreCriticalIssues(inputs),
    scoreActivelyMaintained(inputs),
    scoreDocumentation(inputs),
    scoreCommunityAdoption(inputs),
    scoreVisualAssets(inputs)
  ]

  const weightMap: Record<string, number> = {
    'tests-pass': WEIGHTS.testsPass,
    'no-critical-issues': WEIGHTS.noCriticalIssues,
    'actively-maintained': WEIGHTS.activelyMaintained,
    documentation: WEIGHTS.documentation,
    'community-adoption': WEIGHTS.communityAdoption,
    'visual-assets': WEIGHTS.hasVisualAssets
  }

  let totalWeight = 0
  let earned = 0
  for (const c of checks) {
    // Unknown checks contribute neither weight nor score — a plugin
    // with no usable signal shouldn't get a misleadingly high or low
    // composite, just a smaller-but-honest one.
    if (c.unknown) continue
    const w = weightMap[c.id] ?? 0
    earned += w * STATUS_CONTRIBUTION[c.status]
    totalWeight += w
  }

  const score = totalWeight === 0 ? 0 : Math.round((earned / totalWeight) * 100)

  const rawMetrics: IndicatorRawMetrics = {
    stars: inputs.stars,
    downloadsPerWeek: inputs.downloadsPerWeek,
    openIssues: inputs.openIssues,
    contributors: inputs.contributors,
    lastReleaseDate: inputs.lastReleaseDate
  }

  return {
    score,
    checks,
    rawMetrics
  }
}
