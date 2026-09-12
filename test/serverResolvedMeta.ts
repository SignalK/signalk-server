/**
 * The server reports resolved `displayUnits` and `updateContract` in a path's
 * metadata. Neither is part of the Signal K meta schema, so a full model has
 * to be stripped of them before it is validated against the schema.
 */
interface MetaBearing {
  meta?: Record<string, unknown>
}

export const removeServerResolvedMeta = (nodes: MetaBearing[]): void => {
  for (const node of nodes) {
    if (!node?.meta) continue
    delete node.meta.displayUnits
    delete node.meta.updateContract
  }
}
