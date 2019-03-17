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

var Transform = require('stream').Transform
const AWS = require('aws-sdk')
const debug = require('debug')('signalk-server:s3-provider')

function S3Provider ({ bucket, prefix }) {
  Transform.call(this, {
    objectMode: false
  })
  this.Bucket = bucket
  this.Prefix = prefix
  // AWS.config.credentials = new AWS.SharedIniFileCredentials()
}

require('util').inherits(S3Provider, Transform)

S3Provider.prototype.pipe = function (pipeTo) {
  const doEnd = this.end.bind(this)
  const s3 = new AWS.S3()
  const params = {
    Bucket: this.Bucket,
    Prefix: this.Prefix
  }
  console.log('listobjects')
  s3.listObjects(params)
    .promise()
    .then(data => {
      // console.log(data)
      const jobs = data.Contents.map(
        (item, i) =>
          function () {
            return new Promise((resolve, reject) => {
              console.log('Starting key ' + item.Key)
              const objectParams = {
                Bucket: params.Bucket,
                Key: item.Key
              }
              const request = s3.getObject(objectParams)
              request.on('error', err => {
                console.log(err)
              })
              const stream = request.createReadStream()
              stream.on('end', resolve)
              stream.pipe(
                pipeTo,
                { end: i === data.Contents.length-1 }
              )
            })
          }
      )

      let i = 0
      function startNext() {
        if (i < jobs.length) {
          jobs[i++]().then(startNext);
        } else {
          doEnd()
        }
      }
      startNext();
    })
    .catch(error => {
      console.error(error)
    })
  return pipeTo
}

module.exports = S3Provider
