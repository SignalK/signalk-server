/**
 * ValueEmittingStore - Generic Signal K value store with per-path subscriptions
 *
 * Stores values by context and path$SourceKey, emitting updates to subscribers.
 * Provides O(1) per-path subscriptions instead of Redux's O(n) selectors.
 *
 * Note: path$SourceKey is a unique identifier combining path and $source,
 * since the same path can have multiple values from different sources.
 */

class ValueEmittingStore {
  constructor() {
    // Data storage: { context: { path$SourceKey: pathData } }
    this.data = {}
    // Meta storage: { context: { path: metaData } }
    this.meta = {}
    // Per-path listeners: Map<"context:path$SourceKey", Set<callback>>
    this.listeners = new Map()
    // Listeners for structural changes (new paths added)
    this.structureListeners = new Set()
    // Version counter for structural changes
    this.version = 0
  }

  /**
   * Update a single path's data and notify only its subscribers
   */
  updatePath(context, path$SourceKey, pathData) {
    if (!this.data[context]) {
      this.data[context] = {}
    }

    const isNew = !this.data[context][path$SourceKey]
    this.data[context][path$SourceKey] = pathData

    // Notify path-specific listeners
    const key = `${context}:${path$SourceKey}`
    const listeners = this.listeners.get(key)
    if (listeners) {
      listeners.forEach((callback) => callback(pathData))
    }

    // If new path, notify structure listeners
    if (isNew) {
      this.version++
      this.structureListeners.forEach((callback) => callback(this.version))
    }
  }

  /**
   * Update metadata for a path
   */
  updateMeta(context, path, metaData) {
    if (!this.meta[context]) {
      this.meta[context] = {}
    }
    this.meta[context][path] = { ...this.meta[context][path], ...metaData }
  }

  /**
   * Get data for a specific path
   */
  getPathData(context, path$SourceKey) {
    return this.data[context]?.[path$SourceKey]
  }

  /**
   * Get metadata for a path
   */
  getMeta(context, path) {
    return this.meta[context]?.[path]
  }

  /**
   * Get all path keys for a context
   */
  getPath$SourceKeys(context) {
    return Object.keys(this.data[context] || {})
  }

  /**
   * Get all contexts
   */
  getContexts() {
    return Object.keys(this.data)
  }

  /**
   * Subscribe to a specific path - returns unsubscribe function
   */
  subscribe(context, path$SourceKey, callback) {
    const key = `${context}:${path$SourceKey}`
    if (!this.listeners.has(key)) {
      this.listeners.set(key, new Set())
    }
    this.listeners.get(key).add(callback)

    return () => {
      const listeners = this.listeners.get(key)
      if (listeners) {
        listeners.delete(callback)
        if (listeners.size === 0) {
          this.listeners.delete(key)
        }
      }
    }
  }

  /**
   * Subscribe to structural changes (new paths added)
   */
  subscribeToStructure(callback) {
    this.structureListeners.add(callback)
    return () => this.structureListeners.delete(callback)
  }
}

// Singleton instance
const store = new ValueEmittingStore()

export default store
export { ValueEmittingStore }
