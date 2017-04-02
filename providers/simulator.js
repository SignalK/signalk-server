/*
 *
 * prototype-server: An implementation of a Signal K server for boats.
 * Copyright (C) 2017 Teppo Kurki <teppo.kurki@iki.fi>.
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 *
 * This program is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 * GNU General Public License for more details.
 *
 * You should have received a copy of the GNU General Public License
 * along with this program.  If not, see <http://www.gnu.org/licenses/>.
 *
 */
const EventEmitter = require('events');

const deltas = [{
    "updates": [{
      "source": {
        "label": "n2kFromFile",
        "type": "NMEA2000",
        "pgn": 128259,
        "src": "115"
      },
      "timestamp": "2014-08-15T19:04:01.946",
      "values": [{
        "path": "navigation.speedThroughWater",
        "value": 3.21
      }]
    }]
  },
  {
    "updates": [{
      "source": {
        "label": "n2kFromFile",
        "type": "NMEA2000",
        "pgn": 130311,
        "src": "115"
      },
      "timestamp": "2014-08-15T19:04:01.972",
      "values": [{
        "path": "environment.water.temperature",
        "value": 313.15
      }]
    }]
  },
  {
    "updates": [{
      "source": {
        "label": "n2kFromFile",
        "type": "NMEA2000",
        "pgn": 130311,
        "src": "115"
      },
      "timestamp": "2014-08-15T19:04:02.017",
      "values": [{
        "path": "environment.water.temperature",
        "value": 313.15
      }]
    }]
  }
]

function Simulator(options) {
  const that = this
  var i = 0
  setInterval(() => {
    deltas[i % deltas.length].updates[0].timestamp = new Date().toISOString()
    that.emit('data', deltas[i++ % deltas.length])
  }, 200)
}

require('util').inherits(Simulator, EventEmitter)

module.exports = Simulator;
