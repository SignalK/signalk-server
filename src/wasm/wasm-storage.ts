/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * WASM Plugin Virtual Filesystem (VFS) Management
 *
 * Handles isolated storage for WASM plugins using WASI virtual filesystem.
 * Each plugin gets its own VFS root for secure, sandboxed file access.
 */

import * as fs from 'fs'
import * as path from 'path'
import Debug from 'debug'
import { derivePluginId } from '../pluginid'

const debug = Debug('signalk:wasm:storage')

export interface PluginStoragePaths {
  // Root directory for all plugin data
  pluginDataRoot: string

  // Server-managed config file (outside VFS)
  configFile: string

  // VFS root (what plugin sees as "/")
  vfsRoot: string

  // Standard VFS subdirectories
  vfsData: string // /data (persistent storage)
  vfsConfig: string // /config (plugin-managed config)
  vfsTmp: string // /tmp (temporary files)
}

/**
 * Get storage paths for a WASM plugin
 *
 * @param configPath - Server config directory path
 * @param pluginId - Plugin ID (e.g., "hello-assemblyscript") - used for config file to match regular plugins
 * @param packageName - NPM package name (e.g., "@signalk/hello-assemblyscript") - used for VFS directory
 */
export function getPluginStoragePaths(
  configPath: string,
  pluginId: string,
  packageName: string
): PluginStoragePaths {
  // Config file goes directly in plugin-config-data/ like regular plugins
  const configDataPath = path.join(configPath, 'plugin-config-data')

  // Use plugin ID for config file (matches regular Node.js plugins)
  const configFile = path.join(configDataPath, `${pluginId}.json`)

  // Use sanitized package name for VFS directory (for isolation)
  // Use same pattern as plugin ID: @ → _, / → _
  // @signalk/hello-assemblyscript -> _signalk_hello-assemblyscript
  const sanitizedPackageName = derivePluginId(packageName)
  const pluginDataRoot = path.join(configDataPath, sanitizedPackageName)
  const vfsRoot = path.join(pluginDataRoot, 'vfs')

  return {
    pluginDataRoot,
    configFile, // e.g., ~/.signalk/plugin-config-data/_signalk_example-hello-assemblyscript.json
    vfsRoot, // e.g., ~/.signalk/plugin-config-data/_signalk_example-hello-assemblyscript/vfs/
    vfsData: path.join(vfsRoot, 'data'),
    vfsConfig: path.join(vfsRoot, 'config'),
    vfsTmp: path.join(vfsRoot, 'tmp')
  }
}

/**
 * Initialize VFS structure for a WASM plugin
 */
export function initializePluginVfs(paths: PluginStoragePaths): void {
  debug(`Initializing VFS for plugin at ${paths.vfsRoot}`)

  try {
    // Create VFS root and subdirectories
    const dirsToCreate = [
      paths.pluginDataRoot,
      paths.vfsRoot,
      paths.vfsData,
      paths.vfsConfig,
      paths.vfsTmp
    ]

    for (const dir of dirsToCreate) {
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true })
        debug(`Created directory: ${dir}`)
      }
    }

    debug(`VFS initialized successfully at ${paths.vfsRoot}`)
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error)
    debug(`Failed to initialize VFS: ${errorMsg}`)
    throw new Error(`Failed to initialize plugin VFS: ${errorMsg}`)
  }
}

/**
 * Read plugin configuration from server-managed config file
 */
export function readPluginConfig(configFile: string): any {
  try {
    if (!fs.existsSync(configFile)) {
      debug(`Config file not found: ${configFile}, returning default config`)
      // Note: Do NOT include configuration key - UI shows "Configure" button when configuration is null/undefined
      return {
        enabled: false
      }
    }

    const configData = fs.readFileSync(configFile, 'utf8')
    return JSON.parse(configData)
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error)
    debug(`Error reading plugin config: ${errorMsg}`)
    // Note: Do NOT include configuration key - UI shows "Configure" button when configuration is null/undefined
    return {
      enabled: false
    }
  }
}

/**
 * Write plugin configuration to server-managed config file
 */
export function writePluginConfig(configFile: string, config: any): void {
  try {
    const configDir = path.dirname(configFile)
    if (!fs.existsSync(configDir)) {
      fs.mkdirSync(configDir, { recursive: true })
    }

    fs.writeFileSync(configFile, JSON.stringify(config, null, 2), 'utf8')
    debug(`Wrote plugin config to ${configFile}`)
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error)
    debug(`Error writing plugin config: ${errorMsg}`)
    throw new Error(`Failed to write plugin config: ${errorMsg}`)
  }
}

/**
 * Migrate data from Node.js plugin format to WASM VFS format
 *
 * Copies files from legacy Node.js plugin data directory to VFS /data directory.
 * Legacy files are preserved for rollback.
 */
export function migrateFromNodeJs(
  legacyDataDir: string,
  vfsDataDir: string,
  filesToMigrate: string[]
): void {
  debug(`Migrating data from ${legacyDataDir} to ${vfsDataDir}`)

  if (!fs.existsSync(legacyDataDir)) {
    debug('Legacy data directory does not exist, skipping migration')
    return
  }

  if (!fs.existsSync(vfsDataDir)) {
    fs.mkdirSync(vfsDataDir, { recursive: true })
  }

  let migratedCount = 0

  for (const filename of filesToMigrate) {
    const legacyPath = path.join(legacyDataDir, filename)
    const vfsPath = path.join(vfsDataDir, filename)

    if (fs.existsSync(legacyPath)) {
      try {
        // Copy file to VFS (preserve legacy file)
        fs.copyFileSync(legacyPath, vfsPath)
        debug(`Migrated: ${filename}`)
        migratedCount++
      } catch (error) {
        const errorMsg = error instanceof Error ? error.message : String(error)
        debug(`Failed to migrate ${filename}: ${errorMsg}`)
      }
    }
  }

  debug(
    `Migration complete: ${migratedCount}/${filesToMigrate.length} files migrated`
  )
}

/**
 * Clean up VFS temporary files
 */
export function cleanupVfsTmp(vfsTmpDir: string): void {
  try {
    if (!fs.existsSync(vfsTmpDir)) {
      return
    }

    const files = fs.readdirSync(vfsTmpDir)
    let deletedCount = 0

    for (const file of files) {
      try {
        const filePath = path.join(vfsTmpDir, file)
        const stats = fs.statSync(filePath)

        if (stats.isFile()) {
          fs.unlinkSync(filePath)
          deletedCount++
        }
      } catch (error) {
        debug(`Failed to delete temp file ${file}:`, error)
      }
    }

    debug(`Cleaned up ${deletedCount} temporary files from ${vfsTmpDir}`)
  } catch (error) {
    debug(`Error cleaning up temp directory:`, error)
  }
}

/**
 * Get disk usage for a plugin's VFS
 */
export function getVfsDiskUsage(vfsRoot: string): {
  totalBytes: number
  fileCount: number
} {
  let totalBytes = 0
  let fileCount = 0

  function walkDirectory(dir: string): void {
    try {
      if (!fs.existsSync(dir)) {
        return
      }

      const entries = fs.readdirSync(dir)

      for (const entry of entries) {
        const entryPath = path.join(dir, entry)
        const stats = fs.statSync(entryPath)

        if (stats.isFile()) {
          totalBytes += stats.size
          fileCount++
        } else if (stats.isDirectory()) {
          walkDirectory(entryPath)
        }
      }
    } catch (error) {
      debug(`Error reading directory ${dir}:`, error)
    }
  }

  walkDirectory(vfsRoot)

  return { totalBytes, fileCount }
}

/**
 * Delete all VFS data for a plugin
 */
export function deletePluginVfs(paths: PluginStoragePaths): void {
  debug(`Deleting VFS for plugin at ${paths.vfsRoot}`)

  try {
    if (fs.existsSync(paths.vfsRoot)) {
      fs.rmSync(paths.vfsRoot, { recursive: true, force: true })
      debug(`Deleted VFS directory: ${paths.vfsRoot}`)
    }

    // Note: We keep the server-managed config file for plugin settings
    debug('VFS deletion complete')
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error)
    debug(`Error deleting VFS: ${errorMsg}`)
    throw new Error(`Failed to delete plugin VFS: ${errorMsg}`)
  }
}
