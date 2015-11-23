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

module.exports = function mdns(app) {
  'use strict';

  var _, uuid, mdns, ad, types, serviceId, config, debug, service, services, ads, ad, type, meta;

  _             = require('lodash');
  debug         = require('debug')('signalk-server:interfaces:mdns');
  config        = app.config;
  types         = [];
  ads           = [];
  mdns          = require('mdns');
  uuid          = require('node-uuid').v4;
  serviceId     = String(uuid()).slice(0, 7);

  meta = {
    server: config.name,
    version: config.version,
    //hardcoded out of master/slave, main/aux
    roles: "master, main",
    self: app.selfId,
    vessel_name: (_.isObject(config.settings.vessel) && typeof config.settings.vessel.name === 'string') ? config.settings.vessel.name : '',
    vessel_brand: (_.isObject(config.settings.vessel) && typeof config.settings.vessel.brand === 'string') ? config.settings.vessel.brand : '',
    vessel_type: (_.isObject(config.settings.vessel) && typeof config.settings.vessel.type === 'string') ? config.settings.vessel.type : ''
  };

  if(_.isObject(config.settings.vessel) && typeof config.settings.vessel.mmsi === 'string' && config.settings.vessel.mmsi.trim().length > 0) {
    meta.vessel_mmsi = config.settings.vessel.mmsi;
    meta.vessel_uuid = meta.vessel_mmsi;
  } else if(_.isObject(config.settings.vessel) && typeof config.settings.vessel.uuid === 'string' && config.settings.vessel.uuid.trim().length > 0) {
    meta.vessel_mmsi = config.settings.vessel.uuid;
    meta.vessel_uuid = meta.vessel_mmsi;
  }

  types.push({ type: mdns['tcp']('http'), port: app.config.port });

  for(var key in app.interfaces) {
    if(_.isObject(app.interfaces[key]) && _.isObject(app.interfaces[key].mdns)) {
      service = app.interfaces[key].mdns;

      if('tcp'.indexOf(service.type) !== -1 && service.name.charAt(0) === '_') {
        types.push({ type: mdns[service.type](service.name), port: service.port });
      } else {
        debug('Not advertising mDNS service for interface: ' + key);
        debug('mDNS service type should be TCP or HTTP, and the name should start with "_".');
      }
    }
  }


  for(var i in types) {
    type = types[i];
    ad = new mdns.Advertisement(type.type, type.port, { txtRecord: meta });
    debug("Starting mDNS ad:" + type.type + " " + type.port);
    ad.start();
    ads.push(ad);
  }

  return {
    stop: function() {
      ads.forEach(function(ad) {
        debug('Stopping mdns advertisement..');
        ad.stop();
      })
    }
  }
};