import { create } from 'zustand'
import { persist, createJSONStorage } from 'zustand/middleware'

export interface UiPrefsState {
  expandedNavGroups: Record<string, boolean>
  toggleNavGroup: (name: string) => void
  setNavGroupExpanded: (name: string, expanded: boolean) => void
}

export const useUiPrefs = create<UiPrefsState>()(
  persist(
    (set) => ({
      expandedNavGroups: {},
      toggleNavGroup: (name) =>
        set((s) => ({
          expandedNavGroups: {
            ...s.expandedNavGroups,
            [name]: !s.expandedNavGroups[name]
          }
        })),
      setNavGroupExpanded: (name, expanded) =>
        set((s) => ({
          expandedNavGroups: { ...s.expandedNavGroups, [name]: expanded }
        }))
    }),
    {
      name: 'signalk-admin-ui-prefs',
      storage: createJSONStorage(() => localStorage),
      version: 1
    }
  )
)

export function useExpandedNavGroups() {
  return useUiPrefs((s) => s.expandedNavGroups)
}

export function useToggleNavGroup() {
  return useUiPrefs((s) => s.toggleNavGroup)
}

export function useSetNavGroupExpanded() {
  return useUiPrefs((s) => s.setNavGroupExpanded)
}
