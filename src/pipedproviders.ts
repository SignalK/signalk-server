/*
 * Copyright 2014-2015 Fabian Tollenaar <fabian@starting-point.nl>
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0

 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

import { PropertyValues, PropertyValuesCallback } from '@signalk/server-api'
import { get } from 'lodash-es'
import { Duplex, Writable } from 'stream'
import { SignalKMessageHub, WithConfig } from './app.js'
import { createDebug } from './debug.js'
import { EventsActorId, WithWrappedEmitter } from './events.js'

class DevNull extends Writable {
  constructor() {
    super({
      objectMode: true
    })
  }

  _write(_: Uint8Array, encoding: BufferEncoding, done: () => void) {
    done()
  }
}

interface PipeElementConfig {
  type: string
  options?: {
    providerId: string
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    emitPropertyValue: (name: string, value: any) => void
    onPropertyValues: (name: string, cb: PropertyValuesCallback) => void
    app: unknown
  }
  enabled?: boolean
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  optionMappings: any
}
interface PipedProviderConfig {
  enabled: boolean
  id: string
  pipeElements: PipeElementConfig[]
}

class PipedProvider {}

export function pipedProviders(
  app: SignalKMessageHub &
    WithConfig &
    WithWrappedEmitter & {
      propertyValues: PropertyValues
      setProviderError: (providerId: string, msg: string) => void
    }
) {
  async function createPipedProvider(providerConfig: PipedProviderConfig) {
    const { propertyValues, ...sanitizedApp } = app
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const emitPropertyValue = (name: string, value: any) =>
      propertyValues.emitPropertyValue({
        timestamp: Date.now(),
        setter: `provider:${providerConfig.id}`,
        name,
        value
      })
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const onPropertyValues = (name: string, cb: (value: any) => void) =>
      propertyValues.onPropertyValues(name, cb)
    const boundEventMethods = app.wrappedEmitter.bindMethodsById(
      `connection:${providerConfig.id}` as EventsActorId
    )
    const appFacade = {
      emitPropertyValue,
      onPropertyValues,
      ...sanitizedApp,
      ...boundEventMethods,
      toJSON: () => 'appFacade'
    }

    const pipeElements: Duplex[] = []

    for (const config of providerConfig.pipeElements) {
      if (config.enabled ?? true) {
        pipeElements.push(
          await createPipeElement({
            ...config,
            options: {
              providerId: providerConfig.id,
              app: appFacade,
              ...config.options,
              emitPropertyValue,
              onPropertyValues
            }
          })
        )
      }
    }

    const result = {
      id: providerConfig.id,
      pipeElements
    }

    for (let i = result.pipeElements.length - 2; i >= 0; i--) {
      result.pipeElements[i].pipe(result.pipeElements[i + 1])
    }

    result.pipeElements[result.pipeElements.length - 1].pipe(new DevNull())
    result.pipeElements[result.pipeElements.length - 1].on('data', (msg) => {
      app.handleMessage(providerConfig.id, msg)
    })
    app.emit('pipedProvidersStarted', providerConfig)
    return result
  }

  async function createPipeElement(
    elementConfig: PipeElementConfig
  ): Promise<Duplex> {
    if (elementConfig.optionMappings) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      elementConfig.optionMappings.forEach(function (mapping: any) {
        if (get(app, mapping.fromAppProperty)) {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          ;(elementConfig.options as any)[mapping.toOption] = get(
            app,
            mapping.fromAppProperty
          )
        }
      })
    }
    const effectiveElementType = elementConfig.type.startsWith('providers/')
      ? elementConfig.type.replace('providers/', '@signalk/streams/') + '.js'
      : elementConfig.type

    const module = await import(effectiveElementType)
    return new module.default({
      ...elementConfig.options,
      createDebug
    })
  }

  function startProviders() {
    if (app.config.settings.pipedProviders) {
      const piped = (
        app.config.settings.pipedProviders as PipedProviderConfig[]
      ).reduce<PipedProvider[]>((result, config) => {
        try {
          if (typeof config.enabled === 'undefined' || config.enabled) {
            result.push(createPipedProvider(config))
          }
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
        } catch (e: any) {
          app.setProviderError(config.id, e.message)
          console.error(e)
        }
        return result
      }, [])

      return piped.filter(function (n) {
        return n != null
      })
    } else {
      console.error('No pipedProviders in the settings file')
      return []
    }
  }

  return {
    start: startProviders,
    createPipedProvider: createPipedProvider
  }
}
