/**
 * Signal K AssemblyScript Plugin SDK
 *
 * Provides TypeScript-like API for building WASM plugins
 */

// Export all public types and functions
export * from './plugin'
export * from './signalk'
export * from './api'
export * from './network'
export * from './resources'

// Re-export JSON parsing library for plugin authors
export { JSON } from 'assemblyscript-json/assembly'
