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
  var path   = require('path');
  var debug  = require('debug')('signalk-server:config:cli');
  
  this.app.__argv = process.argv.slice(2);
  this.app.argv   = require('minimist')(this.app.__argv);
  var settings    = path.normalize(__dirname + '/../../' + getSettingsFilename(this.app.argv));

  try {
    this.app.config.settings = require(settings);
  } catch(e) {
    debug('error parsing settings file: ' + settings);
    this.app.config.settings = {};
  }
}).call(global);

function getSettingsFilename(argv) {
  return argv.s || 'settings.json';
}