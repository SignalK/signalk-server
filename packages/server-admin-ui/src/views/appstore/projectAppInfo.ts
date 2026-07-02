import type { AppInfo, AppStoreState } from '../../store/types'

// Build the same synthetic AppInfo shape Apps.tsx projects so consumers
// (cards, rows, the detail page) see consistent installed / newVersion /
// installing flags without each rebuilding the merge themselves.
//
// `seed` is for callers like the detail page which can hit the route
// directly (deep link) before the appStore list endpoints have
// hydrated. The detail payload carries enough fields to render the
// header; passing them as a seed gives the projection a base to lay
// install-state flags on top of, instead of returning undefined and
// hiding the action control entirely until the list arrives.
export function projectAppInfo(
  name: string,
  appStore: AppStoreState,
  seed?: Partial<AppInfo>
): AppInfo | undefined {
  // Cache the four list lookups so each is traversed at most once; the
  // base resolution and install/update branches reuse them.
  const installedEntry = appStore.installed.find((a) => a.name === name)
  const availableEntry = appStore.available.find((a) => a.name === name)
  const updateEntry = appStore.updates.find((a) => a.name === name)
  const installingEntry = appStore.installing.find((i) => i.name === name)

  const base =
    installedEntry ||
    availableEntry ||
    updateEntry ||
    (seed ? ({ ...seed, name } as AppInfo) : undefined)
  if (!base) return undefined

  let projected: AppInfo = { ...base }
  if (installedEntry) {
    projected = {
      ...installedEntry,
      installed: true,
      // installedEntry.version is the LATEST npm version, not the
      // on-disk one — the server populates pluginInfo.version from
      // the npm search response and pluginInfo.installedVersion from
      // disk (see src/interfaces/appstore.js). So when updateEntry
      // exists, installedEntry.version IS the upgrade target. Don't
      // "fix" this to updateEntry.version; the values are equal but
      // reading from installedEntry keeps the projection identical
      // to Apps.tsx's inline merge.
      newVersion: updateEntry ? installedEntry.version : undefined,
      updateDisabled: updateEntry?.updateDisabled
    }
  }

  if (installingEntry) {
    projected = {
      ...projected,
      installing: true,
      isInstalling: installingEntry.isInstalling,
      isWaiting: installingEntry.isWaiting,
      isRemoving: installingEntry.isRemoving,
      isRemove: installingEntry.isRemove,
      installFailed: installingEntry.installFailed
    }
  }

  return projected
}
