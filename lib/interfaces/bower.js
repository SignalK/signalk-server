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

var debug = require('debug')('signalk:interfaces:bower'),
    fs = require('fs');


module.exports = function(app) {
  var express = require('express');
  return {
    start: function() {
      app.use('/bower_components', express.static(__dirname + '/../../bower_components'));
      app.use('/', express.static(__dirname + '/../../bower_components'));
      app.get('/apps', bowerIndex);
    }
  }
};

function bowerIndex(req, res, next) {
  var html = require('fs').readFileSync(__dirname + '/bowerindex.html', {encoding: 'utf8'})
  var insertionIndex = html.indexOf('</div>');
  var sliceToInsertion = html.slice(0, insertionIndex);
  var sliceToEnd = html.slice(insertionIndex);

  var result = sliceToInsertion;
  result += '<ul class="list-group">';
  result += getBowerComponents().reduce(function(result, componentInfo) {
    result += '<li class="list-group-item">';
    result += '<b><a href="' + componentInfo.name + '">' + componentInfo.name + '</a></b> ';
    result += componentInfo.description;
    result += '</li>\n';
    return result;
  }, '');
  result += '</ul>';
  result += sliceToEnd;
  res.send(result);
}

function getBowerComponents() {
  var bowerBaseDir = __dirname + '/../../bower_components/';
  var bowerFiles = [];

  try {
    bowerFiles = fs.readdirSync(bowerBaseDir);
  } catch (exception) {
    debug("No such directory:", bowerBaseDir);
  }

  return bowerFiles.reduce(function(result, dir) {
    try {
      var componentBowerInfo = require(bowerBaseDir + dir + '/bower.json');
      if (componentBowerInfo.keywords &&
        componentBowerInfo.keywords.indexOf('signalk-ui') >= 0) {
        return result.concat(componentBowerInfo);
      }
    } catch (exception) {
      debug("Unable to get bower info for " + dir);
    }
    return result;
  }, []);
}
