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
import { createDebug } from './debug'
import _ from 'lodash'
import { Duplex, Writable } from 'stream'
import { SignalKMessageHub, WithConfig } from './app'

class DevNull extends Writable {
  constructor() {
    super({
      objectMode: true
    })
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  _write(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    chunk: any,
    encoding: BufferEncoding,
    done: (error?: Error | null) => void
  ): void {
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

module.exports = function (
  app: SignalKMessageHub &
    WithConfig & {
      propertyValues: PropertyValues
      setProviderError: (providerId: string, msg: string) => void
    }
) {
  function createPipedProvider(providerConfig: PipedProviderConfig) {
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
      app.propertyValues.onPropertyValues(name, cb)
    const appFacade = {
      emitPropertyValue,
      onPropertyValues,
      ...sanitizedApp,
      toJSON: () => 'appFacade'
    }

    const result = {
      id: providerConfig.id,
      pipeElements: providerConfig.pipeElements.reduce<Duplex[]>(
        (res, config) => {
          if (typeof config.enabled === 'undefined' || config.enabled) {
            res.push(
              createPipeElement({
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
          return res
        },
        []
      )
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

  function createPipeElement(elementConfig: PipeElementConfig): Duplex {
    if (elementConfig.optionMappings) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      elementConfig.optionMappings.forEach(function (mapping: any) {
        if (_.get(app, mapping.fromAppProperty)) {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          ;(elementConfig.options as any)[mapping.toOption] = _.get(
            app,
            mapping.fromAppProperty
          )
        }
      })
    }
    const efectiveElementType = elementConfig.type.startsWith('providers/')
      ? elementConfig.type.replace('providers/', '@signalk/streams/')
      : elementConfig.type
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    return new (require(efectiveElementType))({
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
