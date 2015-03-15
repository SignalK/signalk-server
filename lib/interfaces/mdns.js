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

  console.log(config);

  meta = {
    server: config.name,
    version: config.version,
    vessel_name: config.settings.vessel.name,
    vessel_brand: config.settings.vessel.brand,
    vessel_type: config.settings.vessel.type
  };

  if(typeof config.settings.vessel.mmsi === 'string' && config.settings.vessel.mmsi.trim().length > 0) {
    meta.vessel_mmsi = config.settings.vessel.mmsi;
    meta.vessel_uuid = meta.vessel_mmsi;
  } else {
    meta.vessel_mmsi = config.settings.vessel.uuid;
    meta.vessel_uuid = meta.vessel_mmsi;
  }

  services = {
    rest: { name: '_signalk-tcp', port: app.config.port },
    ws: { name: '_signalk-ws', port: app.config.port }
  };

  for(var key in app.interfaces) {
    if(!_.isUndefined(services[key])) {
      service = services[key];
      types.push({ type: mdns.tcp(service.name), port: service.port });
    }
  }

  for(var i in types) {
    type = types[i];
    ad = new mdns.Advertisement(type.type, type.port, { txtRecord: meta });
    ad.start();
    ads.push(ad);
  }
};