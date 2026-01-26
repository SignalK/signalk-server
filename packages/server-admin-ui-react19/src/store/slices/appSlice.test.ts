import { describe, it, expect, beforeEach } from 'vitest'
import { useStore } from '../index'
import type { Plugin, Webapp, LoginStatus, AppStoreState } from '../types'

describe('appSlice', () => {
  beforeEach(() => {
    // Reset store to initial state before each test
    useStore.setState({
      plugins: [],
      webapps: [],
      addons: [],
      appStore: {
        updates: [],
        installed: [],
        available: [],
        installing: []
      },
      loginStatus: {},
      serverSpecification: {},
      restarting: false,
      accessRequests: [],
      discoveredProviders: [],
      restoreStatus: {},
      vesselInfo: {},
      backpressureWarning: null,
      serverStatistics: null,
      providerStatus: []
    })
  })

  describe('setPlugins', () => {
    it('should update plugins state', () => {
      const plugins: Plugin[] = [
        { id: 'plugin-1', name: 'Test Plugin', version: '1.0.0' },
        { id: 'plugin-2', name: 'Another Plugin', version: '2.0.0' }
      ]

      useStore.getState().setPlugins(plugins)

      expect(useStore.getState().plugins).toEqual(plugins)
    })

    it('should replace existing plugins', () => {
      const initialPlugins: Plugin[] = [
        { id: 'old', name: 'Old Plugin', version: '0.1.0' }
      ]
      const newPlugins: Plugin[] = [
        { id: 'new', name: 'New Plugin', version: '3.0.0' }
      ]

      useStore.getState().setPlugins(initialPlugins)
      useStore.getState().setPlugins(newPlugins)

      expect(useStore.getState().plugins).toEqual(newPlugins)
    })
  })

  describe('setWebapps', () => {
    it('should update webapps state', () => {
      const webapps: Webapp[] = [
        { name: 'Webapp 1', description: 'A webapp' },
        { name: 'Webapp 2', description: 'Another webapp' }
      ]

      useStore.getState().setWebapps(webapps)

      expect(useStore.getState().webapps).toEqual(webapps)
    })
  })

  describe('setLoginStatus', () => {
    it('should update login status', () => {
      const loginStatus: LoginStatus = {
        status: 'loggedIn',
        username: 'testuser',
        allowNewUserRegistration: true,
        allowDeviceAccessRequests: true
      }

      useStore.getState().setLoginStatus(loginStatus)

      expect(useStore.getState().loginStatus).toEqual(loginStatus)
    })

    it('should handle empty login status', () => {
      useStore.getState().setLoginStatus({})

      expect(useStore.getState().loginStatus).toEqual({})
    })
  })

  describe('setAppStore', () => {
    it('should sort appStore lists alphabetically by name', () => {
      const appStore: AppStoreState = {
        updates: [
          { name: 'zebra', version: '1.0' },
          { name: 'alpha', version: '1.0' }
        ],
        installed: [
          { name: 'charlie', version: '1.0' },
          { name: 'beta', version: '1.0' }
        ],
        available: [{ name: 'delta', version: '1.0' }],
        installing: []
      }

      useStore.getState().setAppStore(appStore)

      const state = useStore.getState().appStore
      expect(state.updates[0].name).toBe('alpha')
      expect(state.updates[1].name).toBe('zebra')
      expect(state.installed[0].name).toBe('beta')
      expect(state.installed[1].name).toBe('charlie')
    })
  })

  describe('setRestarting', () => {
    it('should set restarting to true', () => {
      useStore.getState().setRestarting(true)

      expect(useStore.getState().restarting).toBe(true)
    })

    it('should set restarting to false', () => {
      useStore.getState().setRestarting(true)
      useStore.getState().setRestarting(false)

      expect(useStore.getState().restarting).toBe(false)
    })
  })

  describe('setVesselInfo', () => {
    it('should update vessel info', () => {
      const vesselInfo = {
        name: 'My Boat',
        mmsi: '123456789',
        uuid: 'urn:mrn:signalk:uuid:test'
      }

      useStore.getState().setVesselInfo(vesselInfo)

      expect(useStore.getState().vesselInfo).toEqual(vesselInfo)
    })
  })

  describe('setBackpressureWarning', () => {
    it('should set backpressure warning', () => {
      const warning = {
        message: 'High backpressure detected',
        timestamp: new Date().toISOString()
      }

      useStore.getState().setBackpressureWarning(warning)

      expect(useStore.getState().backpressureWarning).toEqual(warning)
    })

    it('should clear backpressure warning with null', () => {
      useStore.getState().setBackpressureWarning({
        message: 'test',
        timestamp: ''
      })
      useStore.getState().setBackpressureWarning(null)

      expect(useStore.getState().backpressureWarning).toBeNull()
    })
  })

  describe('setDebugSettings', () => {
    it('should update debug enabled setting', () => {
      useStore.getState().setDebugSettings({ debugEnabled: 'signalk:*' })

      expect(useStore.getState().log.debugEnabled).toBe('signalk:*')
    })

    it('should update remember debug setting', () => {
      useStore.getState().setDebugSettings({ rememberDebug: true })

      expect(useStore.getState().log.rememberDebug).toBe(true)
    })

    it('should preserve other log state when updating partial settings', () => {
      useStore.getState().setDebugSettings({ debugEnabled: 'test:*' })
      useStore.getState().setDebugSettings({ rememberDebug: true })

      const logState = useStore.getState().log
      expect(logState.debugEnabled).toBe('test:*')
      expect(logState.rememberDebug).toBe(true)
    })
  })

  describe('addLogEntry', () => {
    it('should add a log entry', () => {
      const entry = {
        ts: '2024-01-15T10:30:00Z',
        row: 'Test log message'
      }

      useStore.getState().addLogEntry(entry)

      const entries = useStore.getState().log.entries
      const lastEntry = entries[entries.length - 1]
      expect(lastEntry.d).toContain('Test log message')
    })

    it('should style error entries with red color', () => {
      const entry = {
        ts: '2024-01-15T10:30:00Z',
        row: 'Error message',
        isError: true
      }

      useStore.getState().addLogEntry(entry)

      const entries = useStore.getState().log.entries
      const lastEntry = entries[entries.length - 1]
      expect(lastEntry.d).toContain('color:red')
    })

    it('should limit log entries to 100', () => {
      // Add 150 entries
      for (let i = 0; i < 150; i++) {
        useStore.getState().addLogEntry({
          ts: '2024-01-15T10:30:00Z',
          row: `Message ${i}`
        })
      }

      const entries = useStore.getState().log.entries
      expect(entries.length).toBe(100)
    })
  })
})
