/* eslint-disable @typescript-eslint/no-explicit-any */

export interface TalkerGroups {
  [groupName: string]: string[]
}

// Reverse lookup: talker ID → group name
export type TalkerLookup = Map<string, string>

export function buildTalkerLookup(groups: TalkerGroups): TalkerLookup {
  const lookup = new Map<string, string>()
  for (const [groupName, talkers] of Object.entries(groups)) {
    for (const talker of talkers) {
      lookup.set(talker, groupName)
    }
  }
  return lookup
}

export function buildProviderTalkerLookups(
  pipedProviders: any[]
): Map<string, TalkerLookup> {
  const result = new Map<string, TalkerLookup>()
  if (!Array.isArray(pipedProviders)) return result

  for (const provider of pipedProviders) {
    if (!provider.id || !provider.pipeElements?.[0]?.options) continue
    const options = provider.pipeElements[0].options
    const subOptions = options.subOptions || options
    if (
      subOptions.talkerGroups &&
      typeof subOptions.talkerGroups === 'object'
    ) {
      result.set(provider.id, buildTalkerLookup(subOptions.talkerGroups))
    }
  }
  return result
}
