/*
 * Copyright 2015 Teppo Kurki <teppo.kurki@iki.fi>
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

import { Transform } from 'stream'
/*
  aws-sdk is not included in dependencies because of the
  persistent deprecation warnings caused by its transitive
  dependencies. This feature is not in wide use, especially
  not in signalk-server where people encounter the scary looking
  deprecation warnings.
  Known to work with ^2.413.0
*/
import { S3 } from 'aws-sdk'

interface S3ProviderOptions {
  bucket: string
  prefix: string
}

export default class S3Provider extends Transform {
  private readonly Bucket: string
  private readonly Prefix: string

  constructor({ bucket, prefix }: S3ProviderOptions) {
    super({ objectMode: false })
    this.Bucket = bucket
    this.Prefix = prefix
  }

  pipe<T extends NodeJS.WritableStream>(pipeTo: T): T {
    const doEnd = this.end.bind(this)
    const s3 = new S3()
    const params = {
      Bucket: this.Bucket,
      Prefix: this.Prefix
    }
    console.log('listobjects')
    s3.listObjects(params)
      .promise()
      .then((data) => {
        const jobs = data.Contents.map(
          (item, i) =>
            function () {
              return new Promise<void>((resolve) => {
                console.log('Starting key ' + item.Key)
                const objectParams = {
                  Bucket: params.Bucket,
                  Key: item.Key
                }
                const request = s3.getObject(objectParams)
                request.on('error', (err) => {
                  console.log(err)
                })
                const stream = request.createReadStream()
                stream.on('end', resolve)
                stream.pipe(pipeTo, {
                  end: i === data.Contents.length - 1
                })
              })
            }
        )

        let idx = 0
        function startNext() {
          if (idx < jobs.length) {
            jobs[idx++]!().then(startNext)
          } else {
            doEnd()
          }
        }
        startNext()
      })
      .catch((error) => {
        console.error(error)
      })
    return pipeTo
  }
}
