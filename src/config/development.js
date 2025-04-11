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

import { isUndefined } from 'lodash-es'
import errorhandler from 'errorhandler'
import morgan from 'morgan'

export default function (app) {
  'use strict'

  if (app.get('env') === 'development') {
    app.config.environment = 'development'

    app.use(
      errorhandler({
        dumpExceptions: true,
        showStack: true
      })
    )

    const morganOptions = {}
    const accessLogging =
      isUndefined(app.config.settings.accessLogging) ||
      app.config.settings.accessLogging
    if (!accessLogging) {
      morganOptions.skip = () => true
    }
    app.use(morgan('dev', morganOptions))
  }
}
