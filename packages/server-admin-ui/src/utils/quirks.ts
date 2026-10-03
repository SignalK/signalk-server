/**
 * canboatjs device quirks, as canboat's --quirk takes them: entries
 * separated by whitespace, but whitespace next to a comma stays inside a
 * device list ("gps-rollover=4, 1851:491603" is one entry). Empty entries
 * are kept so the field can be typed into; the server drops them.
 */
export function splitQuirksField(text: string): string[] {
  // Splitting on a captured run keeps the runs: parts alternate
  // entry, whitespace, entry, ...
  const parts = text.split(/(\s+)/)
  const entries = [parts[0]]
  for (let i = 1; i < parts.length; i += 2) {
    const before = entries[entries.length - 1]
    const after = parts[i + 1]
    if (before.endsWith(',') || after.startsWith(',')) {
      entries[entries.length - 1] = before + parts[i] + after
    } else {
      entries.push(after)
    }
  }
  return entries
}
