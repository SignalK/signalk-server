/**
 * Path metadata types for the Signal K data model.
 */

/** Metadata associated with a Signal K well-known path. */
export interface PathMetadataEntry {
  description: string
  units?: string
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
}
