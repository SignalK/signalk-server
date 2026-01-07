/**
 * DataBrowserStore - Simple EventEmitter-style store for path data
 *
 * Provides O(1) per-path subscriptions instead of Redux's O(n) selectors.
 * Each row component subscribes only to its own path.
 */

class DataBrowserStore {
  constructor() {
    // Data storage: { context: { pathKey: pathData } }
    this.data = {}
    // Meta storage: { context: { path: metaData } }
    this.meta = {}
    // Per-path listeners: Map<"context:pathKey", Set<callback>>
    this.listeners = new Map()
    // Listeners for structural changes (new paths added)
    this.structureListeners = new Set()
    // Version counter for structural changes
    this.version = 0
  }

  /**
   * Update a single path's data and notify only its subscribers
   */
  updatePath(context, pathKey, pathData) {
    if (!this.data[context]) {
      this.data[context] = {}
    }

    const isNew = !this.data[context][pathKey]
    this.data[context][pathKey] = pathData

    // Notify path-specific listeners
    const key = `${context}:${pathKey}`
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
  getPathData(context, pathKey) {
    return this.data[context]?.[pathKey]
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
  getPathKeys(context) {
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
  subscribe(context, pathKey, callback) {
    const key = `${context}:${pathKey}`
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

  /**
   * Clear all data for a context
   */
  clearContext(context) {
    delete this.data[context]
    delete this.meta[context]
    this.version++
    this.structureListeners.forEach((callback) => callback(this.version))
  }

  /**
   * Clear all data
   */
  clear() {
    this.data = {}
    this.meta = {}
    this.listeners.clear()
    this.version++
    this.structureListeners.forEach((callback) => callback(this.version))
  }
}

// Singleton instance
const store = new DataBrowserStore()

export default store
export { DataBrowserStore }
