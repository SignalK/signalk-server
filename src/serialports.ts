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

import { Ports } from '@signalk/server-api'
import fs from 'fs'
import { SerialPort } from 'serialport'

export const listAllSerialPorts = (): Promise<Ports> => {
  return new Promise((resolve, reject) => {
    Promise.all([
      listSafeSerialPortsDevSerialById(),
      listSafeSerialPortsDevSerialByPath(),
      listSafeSerialPortsOpenPlotter(),
      listSerialPorts()
    ])
      .then(([byId, byPath, byOpenPlotter, serialports]) =>
        resolve({ byId, byPath, byOpenPlotter, serialports })
      )
      .catch(reject)
  })
}

function listSerialPorts() {
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    return SerialPort.list()
  } catch (_err) {
    return Promise.resolve([])
  }
}

function listSafeSerialPortsDevSerialById() {
  return fs.promises
    .readdir('/dev/serial/by-id')
    .catch(() => [])
    .then((filenames: string[]) =>
      filenames.map((filename: string) => `/dev/serial/by-id/${filename}`)
    )
}

function listSafeSerialPortsDevSerialByPath() {
  return fs.promises
    .readdir('/dev/serial/by-path')
    .catch(() => [])
    .then((filenames: string[]) =>
      filenames.map((filename: string) => `/dev/serial/by-path/${filename}`)
    )
}

function listSafeSerialPortsOpenPlotter() {
  return fs.promises
    .readdir('/dev/')
    .catch(() => [])
    .then((filenames: string[]) =>
      filenames
        .filter((filename) => filename.startsWith('ttyOP_'))
        .map((filename) => `/dev/${filename}`)
    )
}
