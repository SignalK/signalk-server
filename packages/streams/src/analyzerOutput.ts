import { getPGNWithId } from '@canboat/ts-pgns'

/*
 * canboat's analyzer, invoked with -camel (as n2kAnalyzer does), wraps every
 * JSON message in a single-key envelope keyed by the camelCase PGN id:
 *
 *   {"isoAddressClaim": {"prio":6,"src":3,...,"fields":{...}}}
 *
 * It has done so since canboat v6.0.0 — the flat form the rest of the
 * pipeline (n2k-signalk's toDelta) expects only exists in non-camel mode,
 * whose TitleCase field names n2k-signalk cannot map either. So the envelope
 * must be unwrapped here.
 *
 * Field values need normalising too. canboatjs renders lookup fields as the
 * enumeration name when known (falling back to the raw number), EXCEPT
 * indirect lookups (e.g. 60928's deviceFunction, whose meaning depends on
 * deviceClass), which stay numeric. n2k-signalk relies on that convention:
 * it derives the device canName by re-encoding PGN 60928 through canboatjs's
 * toPgn, and a name-string where a number is expected changes the encoded
 * NAME — every device would get a different source ref on the analyzer path
 * than on the canboatjs path, silently detaching per-source settings.
 *
 * The analyzer cannot be told to follow canboatjs's convention, but with
 * -nv it emits every such field as {value, name}, which lets us pick the
 * right representation per field using the PGN schema: the envelope key is
 * exactly the ts-pgns definition id, and INDIRECT_LOOKUP fields take the
 * numeric value while everything else prefers the name. Bit lookups arrive
 * as arrays of {value, name} and map to arrays of names, matching canboatjs.
 *
 * One more asymmetry: the analyzer omits SPARE/RESERVED fields whose bits
 * are all zero (its -json mode skips empty values; -empty does not bring
 * them back). canboatjs emits them as 0, and toPgn fills fields that are
 * absent with all-ones ("unavailable") — which would again corrupt the
 * re-encoded canName (the 60928 spare bit sits inside the NAME). So missing
 * SPARE/RESERVED fields are restored as 0 from the schema.
 */

interface NameValue {
  value: unknown
  name?: string | null
}

const isNameValue = (v: unknown): v is NameValue =>
  typeof v === 'object' && v !== null && !Array.isArray(v) && 'value' in v

const isPlainObject = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v)

function fieldTypesForId(id: string): Record<string, string> {
  const types: Record<string, string> = {}
  const definition = getPGNWithId(id)
  if (definition) {
    for (const field of definition.Fields) {
      types[field.Id] = field.FieldType as string
    }
  }
  return types
}

const isSpareOrReserved = (fieldType: string | undefined) =>
  fieldType === 'SPARE' || fieldType === 'RESERVED'

function normalizeValue(
  value: unknown,
  fieldType: string | undefined,
  types: Record<string, string>
): unknown {
  if (Array.isArray(value)) {
    if (fieldType === 'BITLOOKUP') {
      // canboatjs renders a bit lookup as the names of the set bits and
      // yields [] when no named bit is set (incl. the all-ones
      // "unavailable" pattern); entries whose bit has no enumeration name
      // are therefore dropped rather than kept as raw numbers.
      return value
        .map((entry) => (isNameValue(entry) ? entry.name : entry))
        .filter((name) => typeof name === 'string')
    }
    return value.map((entry) =>
      isNameValue(entry)
        ? (entry.name ?? entry.value)
        : isPlainObject(entry)
          ? normalizeFields(entry, types)
          : entry
    )
  }
  if (isNameValue(value)) {
    return fieldType === 'INDIRECT_LOOKUP'
      ? value.value
      : (value.name ?? value.value)
  }
  if (isPlainObject(value)) {
    return normalizeFields(value, types)
  }
  return value
}

function normalizeFields(
  fields: Record<string, unknown>,
  types: Record<string, string>
): Record<string, unknown> {
  const result: Record<string, unknown> = {}
  for (const [id, value] of Object.entries(fields)) {
    result[id] = normalizeValue(value, types[id], types)
  }
  return result
}

/**
 * Turn one parsed line of `analyzer -json -si -camel -nv` output into the
 * flat, canboatjs-shaped PGN object the downstream pipeline expects.
 * Passes through anything that is not a single-key camel envelope (already
 * flat output from a pre-v6 analyzer, or unrecognised shapes) unchanged.
 */
export function unwrapAnalyzerOutput(
  parsed: Record<string, unknown>
): Record<string, unknown> {
  const keys = Object.keys(parsed)
  const id = keys.length === 1 ? keys[0] : undefined
  if (id === undefined) {
    return parsed
  }
  const inner = parsed[id]
  if (!isPlainObject(inner) || typeof inner.pgn !== 'number') {
    return parsed
  }
  const types = fieldTypesForId(id)
  const result: Record<string, unknown> = { ...inner }
  if (isPlainObject(inner.fields)) {
    const fields = normalizeFields(inner.fields, types)
    for (const [fieldId, fieldType] of Object.entries(types)) {
      if (isSpareOrReserved(fieldType) && !(fieldId in fields)) {
        fields[fieldId] = 0
      }
      // The analyzer also omits bit lookups with no set bits; canboatjs
      // emits [], from which n2k-signalk derives "normal" notification
      // states — restore the empty array so those states are not lost.
      if (fieldType === 'BITLOOKUP' && !(fieldId in fields)) {
        fields[fieldId] = []
      }
    }
    result.fields = fields
  }
  return result
}
