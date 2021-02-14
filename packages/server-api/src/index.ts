import { PropertyValues, PropertyValuesCallback } from './propertyvalues';

export * from './propertyvalues'

export interface InternalServerAPI {
  propertyValues: PropertyValues
}

type Unsubscribe = () => {}
/**
 * This is the API that a server exposes in the app object that
 * is passed in Plugin "constructor" call.
 * 
 * INCOMPLETE, work in progress.
 */
export interface PluginServerAPI {
  emitPropertyValue: (name: string, value: any) => void
  onPropertyValues: (name: string, cb: PropertyValuesCallback) => Unsubscribe
}

/**
 * This is the API that a plugin must implement.
 * 
 * INCOMPLETE, work in progress 
 */
export interface PluginAPI {

}