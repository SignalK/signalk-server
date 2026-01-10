/*
 * Copyright 2024 Signal K
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

/**
 * Configuration for a plugin or webapp included in a bundle
 */
export interface BundlePlugin {
  /** npm package name */
  name: string
  /** If true, this plugin is essential for the bundle's purpose */
  required: boolean
  /** Optional default configuration to apply after installation */
  defaultConfig?: Record<string, unknown>
  /** Human-readable description of why this plugin is included */
  description?: string
  /** If true, set this webapp as the default landing page */
  setAsLandingPage?: boolean
}

/**
 * A bundle definition representing a curated set of plugins
 * for a specific use case
 */
export interface BundleDefinition {
  /** Unique identifier for the bundle */
  id: string
  /** Display name */
  name: string
  /** Detailed description of what this bundle provides */
  description: string
  /** Icon name (for UI display) */
  icon?: string
  /** Plugins included in this bundle */
  plugins: BundlePlugin[]
  /** Order for display in the wizard (lower = first) */
  order?: number
}

/**
 * Installation status for a bundle
 */
export interface BundleInstallStatus {
  state: 'idle' | 'installing' | 'configuring' | 'complete' | 'error'
  bundleId?: string
  currentStep: number
  totalSteps: number
  currentItem?: string
  errors: string[]
  installed: string[]
}

/**
 * Request to install one or more bundles
 */
export interface BundleInstallRequest {
  /** Single bundle ID (for backwards compatibility) */
  bundleId?: string
  /** Multiple bundle IDs for multi-bundle installation */
  bundleIds?: string[]
  /** Override: specific plugins to install (expert mode) */
  plugins?: string[]
}
