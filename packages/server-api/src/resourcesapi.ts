export type SignalKResourceType =
  | 'routes'
  | 'waypoints'
  | 'notes'
  | 'regions'
  | 'charts'

export const SIGNALKRESOURCETYPES: SignalKResourceType[] = [
  'routes',
  'waypoints',
  'notes',
  'regions',
  'charts'
]
export const isSignalKResourceType = (s: string) =>
  SIGNALKRESOURCETYPES.includes(s as SignalKResourceType)

export type ResourceType = SignalKResourceType | string

export interface ResourcesApi {
  register: (pluginId: string, provider: ResourceProvider) => void
  unRegister: (pluginId: string) => void
  listResources: (
    resType: SignalKResourceType,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    params: { [key: string]: any },
    providerId?: string
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  ) => Promise<{ [id: string]: any }>
  getResource: (
    resType: SignalKResourceType,
    resId: string,
    providerId?: string
  ) => Promise<object>
  setResource: (
    resType: SignalKResourceType,
    resId: string,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    data: { [key: string]: any },
    providerId?: string
  ) => Promise<void>
  deleteResource: (
    resType: SignalKResourceType,
    resId: string,
    providerId?: string
  ) => Promise<void>
}

export interface ResourceProvider {
  type: ResourceType
  methods: ResourceProviderMethods
}

export interface ResourceProviderMethods {
  listResources: (query: {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    [key: string]: any
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  }) => Promise<{ [id: string]: any }>
  getResource: (id: string, property?: string) => Promise<object>
  setResource: (
    id: string,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    value: { [key: string]: any }
  ) => Promise<void>
  deleteResource: (id: string) => Promise<void>
}

export interface ResourceProviderRegistry {
  registerResourceProvider: (provider: ResourceProvider) => void
}
