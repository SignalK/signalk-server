export interface TalkerGroups {
  [groupName: string]: string[]
}

// Reverse lookup: talker ID → group name
export type TalkerLookup = Map<string, string>

interface PipeElementOptions {
  subOptions?: { talkerGroups?: TalkerGroups; [key: string]: unknown }
  talkerGroups?: TalkerGroups
  [key: string]: unknown
}

interface PipedProviderConfig {
  id?: string
  pipeElements?: Array<{ options?: PipeElementOptions }>
  [key: string]: unknown
}

// Group names are normalised to lowercase to match the admin UI, so that
// manual settings.json edits with mixed case still match canonical group ids.
export function buildTalkerLookup(groups: TalkerGroups): TalkerLookup {
  const lookup = new Map<string, string>()
  for (const [rawGroupName, talkers] of Object.entries(groups)) {
    const groupName = rawGroupName.trim().toLowerCase()
    for (const talker of talkers) {
      const existing = lookup.get(talker)
      if (existing && existing !== groupName) {
        console.warn(
          `nmea0183 talker '${talker}' is mapped to multiple groups ` +
            `('${existing}' and '${groupName}'); the later mapping wins.`
        )
      }
      lookup.set(talker, groupName)
    }
  }
  return lookup
}

export function buildProviderTalkerLookups(
  pipedProviders: PipedProviderConfig[]
): Map<string, TalkerLookup> {
  const result = new Map<string, TalkerLookup>()
  if (!Array.isArray(pipedProviders)) return result

  for (const provider of pipedProviders) {
    if (!provider.id || !provider.pipeElements?.[0]?.options) continue
    const options = provider.pipeElements[0].options
    const subOptions = options.subOptions || options
    if (
      subOptions.talkerGroups &&
      typeof subOptions.talkerGroups === 'object' &&
      !Array.isArray(subOptions.talkerGroups)
    ) {
      result.set(provider.id, buildTalkerLookup(subOptions.talkerGroups))
    }
  }
  return result
}
