
export type SignalKResourceType = 'routes' | 'waypoints' |'notes' |'regions' |'charts'

export const SIGNALKRESOURCETYPES: SignalKResourceType[] = [
  'routes',
  'waypoints',
  'notes',
  'regions',
  'charts'
]
export const isSignalKResourceType = (s: string) => SIGNALKRESOURCETYPES.includes(s as SignalKResourceType)

export type ResourceType = SignalKResourceType | string

export interface ResourcesApi {
  register: (pluginId: string, provider: ResourceProvider) => void;
  unRegister: (pluginId: string) => void;
  listResources: (
    resType: SignalKResourceType, 
    params: { [key: string]: any }, 
    providerId?: string
  ) => Promise<{[id: string]: any}>
  getResource: (
    resType: SignalKResourceType, 
    resId: string, 
    providerId?: string
  ) => Promise<object>
  setResource: (
    resType: SignalKResourceType,
    resId: string,
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
  listResources: (query: { [key: string]: any }) => Promise<{[id: string]: any}>
  getResource: (id: string, property?: string) => Promise<object>
  setResource: (
    id: string,
    value: { [key: string]: any }
  ) => Promise<void>
  deleteResource: (id: string) => Promise<void>
}

export interface ResourceProviderRegistry {
  registerResourceProvider: (provider: ResourceProvider) => void;
}
