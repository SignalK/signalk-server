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

(function() {
  var self   = this;
  var path   = require('path');
  var debug  = require('debug')('signalk-server:config:cli');

  function getSettingsFilename(argv) {
    if(self.overrides.settings && typeof self.overrides.settings === 'string') {
      debug('Settings filename was set using .settings(), overriding all other options');
      return self.overrides.settings;
    }

    return argv.s || 'settings.json';
  }

  if(this.overrides.settings !== null && typeof this.overrides.settings === 'object') {
    debug('Settings object was set using .settings(), overriding all other options');
    this.app.config.settings =  this.overrides.settings;
  } else {
    this.app.__argv = process.argv.slice(2);
    this.app.argv   = require('minimist')(this.app.__argv);
    var settings    = path.join(process.cwd(), getSettingsFilename(this.app.argv));

    try {
      this.app.config.settings = require(settings);
    } catch(e) {
      console.error('error parsing settings file: ' + settings);
      this.app.config.settings = {};
    }
  }
}).call(global);