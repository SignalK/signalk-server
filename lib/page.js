/*
 * Copyright 2017 Teppo Kurki <teppo.kurki@iki.fi>
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

const fs = require('fs')

module.exports = function (filename, insertionTag) {
  var html = fs.readFileSync(filename, {
    encoding: 'utf8'
  })
  if (!insertionTag) {
    insertionTag = '<div/>'
  }
  var insertionIndex = html.indexOf(insertionTag)
  return {
    result: html.slice(0, insertionIndex),
    footer: html.slice(insertionIndex)
  }
}
