/**
 * Path metadata types for the Signal K data model.
 */

/** How a path is expected to update; see updateContracts. */
export type UpdateContract = 'periodic' | 'event'

/** Metadata associated with a Signal K well-known path. */
export interface PathMetadataEntry {
  description: string
  units?: string
  /**
   * How the path updates: declared directly on the path, or inherited from
   * the nearest declaring subtree. See updateContracts.
   */
  updateContract?: UpdateContract
  enum?: ReadonlyArray<{ id: number; name: string } | string>
  properties?: Record<
    string,
    {
      type?: string
      description?: string
      units?: string
      example?: number | string
      title?: string
      default?: string | number | boolean
      enum?: ReadonlyArray<{ id: number; name: string } | string>
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      items?: Record<string, any>
    }
  >
  /** Runtime metadata (zones, displayUnits, etc.) added via meta deltas or PUT. */
  [key: string]: unknown
}
