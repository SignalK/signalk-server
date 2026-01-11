/* eslint-disable @typescript-eslint/no-explicit-any */
/*
 * Copyright 2020 Scott Bender <scott@scottbender.net>
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

import fs from 'fs'
import _ from 'lodash'
import { atomicWriteFileSync, atomicWriteFile } from './atomicWrite'

const VALUES = 'values'
const META = 'meta'
const SELF_VESSEL = 'vessels.self'

class DeltaEditor {
  deltas: any[]

  constructor() {
    this.deltas = []
  }

  load(filename: string) {
    const data = fs.readFileSync(filename, 'utf8')
    const deltas = JSON.parse(data)

    if (!_.isArray(deltas)) {
      throw new Error(`${filename} should contain an array of deltas`)
    }
    this.deltas = deltas
  }

  saveSync(filename: string) {
    const data = JSON.stringify(this.deltas, null, 2)
    atomicWriteFileSync(filename, data)
  }

  save(filename: string): Promise<void> {
    return atomicWriteFile(filename, JSON.stringify(this.deltas, null, 2))
  }

  setValue(context: string, path: string, value: any) {
    if (_.isUndefined(value)) {
      return this.removeValue(context, path)
    }

    if (path.indexOf('.') === -1) {
      const deltaInfo = getDelta(this.deltas, context, '', VALUES)
      const newVal = deltaInfo && deltaInfo.kp ? deltaInfo.kp.value : {}
      newVal[path] = value
      return setDelta(this.deltas, context, '', newVal, VALUES)
    } else {
      return setDelta(this.deltas, context, path, value, VALUES)
    }
  }

  setSelfValue(path: string, value: any) {
    return this.setValue(SELF_VESSEL, path, value)
  }

  setMeta(context: string, path: string, value: any) {
    return setDelta(this.deltas, context, path, value, META)
  }

  getValue(context: string, path: string) {
    if (path.indexOf('.') === -1) {
      const deltaInfo = getDelta(this.deltas, context, '', VALUES)
      return deltaInfo && deltaInfo.kp && deltaInfo.kp.value[path]
    } else {
      const deltaInfo = getDelta(this.deltas, context, path, VALUES)
      return deltaInfo && deltaInfo.kp && deltaInfo.kp.value
    }
  }

  getSelfValue(path: string) {
    return this.getValue(SELF_VESSEL, path)
  }

  getMeta(context: string, path: string) {
    const deltaInfo = getDelta(this.deltas, context, path, META)
    return deltaInfo && deltaInfo.kp && deltaInfo.kp.value
  }

  removeValue(context: string, path: string) {
    if (path.indexOf('.') === -1) {
      const deltaInfo = getDelta(this.deltas, context, '', VALUES)
      if (deltaInfo && deltaInfo.kp) {
        delete deltaInfo.kp.value[path]

        if (_.keys(deltaInfo.kp.value).length === 0) {
          _.pull(this.deltas, deltaInfo.delta)
        }
      }
    } else {
      const deltaInfo = getDelta(this.deltas, context, path, VALUES)
      if (deltaInfo && deltaInfo.kp) {
        _.pull(deltaInfo.delta.updates[0].values, deltaInfo.kp)
        if (deltaInfo.delta.updates[0].values.length === 0) {
          _.pull(this.deltas, deltaInfo.delta)
        }
      }
    }
  }

  removeSelfValue(path: string) {
    return this.removeValue(SELF_VESSEL, path)
  }

  removeMeta(context: string, path: string) {
    const deltaInfo = getDelta(this.deltas, context, path, META)
    if (deltaInfo && deltaInfo.kp) {
      _.pull(deltaInfo.delta.updates[0].meta, deltaInfo.kp)
      if (deltaInfo.delta.updates[0].meta.length === 0) {
        _.pull(this.deltas, deltaInfo.delta)
      }
    }
  }
}

function setDelta(
  deltas: any[],
  context: string,
  path: string,
  value: any,
  type: string
) {
  const deltaInfo = getDelta(deltas, context, path, type)
  if (deltaInfo && deltaInfo.kp) {
    deltaInfo.kp.value = value
    return deltaInfo.delta
  } else if (deltaInfo) {
    deltaInfo.delta.updates[0][type].push({ path, value })
    return deltaInfo.delta
  } else {
    const delta = {
      context,
      updates: [
        {
          [type]: [
            {
              path,
              value
            }
          ]
        }
      ]
    }
    deltas.push(delta)
    return delta
  }
}

function getDelta(
  deltas: any[],
  context: string,
  path: string,
  type: string
): any {
  for (const delta of deltas) {
    if (delta.updates && delta.context === context) {
      for (const update of delta.updates) {
        if (update[type]) {
          const foundKp = update[type].find((kp: any) => kp.path === path)
          return { delta, kp: foundKp }
        }
      }
    }
  }
  return null
}

export = DeltaEditor
