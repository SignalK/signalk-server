/**
 * The plugin list is a scroll pane with a sticky header, so a filtered or
 * clipped view is easy to mistake for the complete list. Stating both counts
 * makes a partial view self-evident.
 */
export function pluginCountLabel(shown: number, total: number): string {
  if (total === 0) {
    return 'No plugins installed'
  }
  const noun = `plugin${total === 1 ? '' : 's'}`
  if (shown === total) {
    return `${total} ${noun}`
  }
  return `Showing ${shown} of ${total} ${noun}`
}
