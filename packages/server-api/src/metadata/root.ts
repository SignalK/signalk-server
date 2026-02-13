import type { PathMetadataEntry } from './types'

export const rootMetadata: Record<string, PathMetadataEntry> = {
  '/self': {
    description:
      "This holds the context (prefix + UUID, MMSI or URL in dot notation) of the server's self object."
  },
  '/vessels': {
    description:
      'A wrapper object for vessel objects, each describing vessels in range, including this vessel.'
  },
  '/vessels/*': {
    description:
      'This regex pattern is used for validation of an MMSI or Signal K UUID identifier for the vessel. Examples: urn:mrn:imo:mmsi:230099999 urn:mrn:signalk:uuid:c0d79334-4e25-4245-8892-54e8ccc8021d'
  },
  '/vessels/*/url': {
    description: 'URL based identity of the vessel, if available.'
  },
  '/vessels/*/mmsi': {
    description: 'MMSI number of the vessel, if available.'
  },
  '/vessels/*/mothershipMmsi': {
    description: 'MMSI number of the mothership of this vessel, if available.'
  },
  '/vessels/*/uuid': {
    description:
      'A unique Signal K flavoured maritime resource identifier, assigned by the server.'
  },
  '/vessels/*/name': {
    description: 'The common name of the vessel'
  },
  '/vessels/*/flag': {
    description: 'The country of ship registration, or flag state of the vessel'
  },
  '/vessels/*/port': {
    description: 'The home port of the vessel'
  },
  '/aircraft': {
    description:
      'A wrapper object for aircraft, primarily intended for SAR aircraft in relation to marine search and rescue. For clarity about seaplanes etc, if it CAN fly, its an aircraft.'
  },
  '/aircraft/*': {
    description:
      'This regex pattern is used for validation of an MMSI or Signal K UUID identifier for the aircraft. Examples: urn:mrn:imo:mmsi:111099999 urn:mrn:signalk:uuid:c0d79334-4e25-4245-8892-54e8ccc8021d'
  },
  '/aton': {
    description: "A wrapper object for Aids to Navigation (aton's)"
  },
  '/aton/*': {
    description:
      'This regex pattern is used for validation of an MMSI or Signal K UUID identifier for the aid to navigation. Examples: urn:mrn:imo:mmsi:991099999 urn:mrn:signalk:uuid:c0d79334-4e25-4245-8892-54e8ccc8021d'
  },
  '/sar': {
    description:
      "A wrapper object for Search And Rescue (SAR) MMSI's usied in transponders. MOB, EPIRBS etc"
  },
  '/sar/*': {
    description:
      'This regex pattern is used for validation of an MMSI or Signal K UUID identifier for the aid to navigation. Examples: urn:mrn:imo:mmsi:972099999 urn:mrn:signalk:uuid:c0d79334-4e25-4245-8892-54e8ccc8021d'
  },
  '/resources': {
    description:
      'Resources to aid in navigation and operation of the vessel including waypoints, routes, notes, etc.'
  },
  '/resources/charts': {
    description: 'A holder for charts, each named with their chart code'
  },
  '/resources/charts/*': {
    description: 'A chart'
  },
  '/resources/charts/*/name': {
    description: 'Chart common name'
  },
  '/resources/charts/*/identifier': {
    description: 'Chart number'
  },
  '/resources/charts/*/description': {
    description: 'A description of the chart'
  },
  '/resources/charts/*/tilemapUrl': {
    description:
      'A url to the tilemap of the chart for use in TMS chartplotting apps'
  },
  '/resources/charts/*/region': {
    description:
      'Region related to note. A pointer to a region UUID. Alternative to geohash'
  },
  '/resources/charts/*/geohash': {
    description: 'Position related to chart. Alternative to region'
  },
  '/resources/charts/*/chartUrl': {
    description: "A url to the chart file's storage location"
  },
  '/resources/charts/*/scale': {
    description: 'The scale of the chart, the larger number from 1:200000'
  },
  '/resources/charts/*/chartLayers': {
    description: 'If the chart format is WMS, the layers enabled for the chart.'
  },
  '/resources/charts/*/bounds': {
    description:
      "The bounds of the chart. An array containing the position of the upper left corner, and the lower right corner. Useful when the chart isn't inherently geo-referenced."
  },
  '/resources/charts/*/chartFormat': {
    description: 'The format of the chart',
    enum: [
      'gif',
      'geotiff',
      'kap',
      'png',
      'jpg',
      'kml',
      'wkt',
      'topojson',
      'geojson',
      'gpx',
      'tms',
      'wms',
      'S-57',
      'S-63',
      'svg',
      'other'
    ]
  },
  '/resources/routes': {
    description: 'A holder for routes, each named with a UUID'
  },
  '/resources/routes/*': {
    description: 'A route, named with a UUID'
  },
  '/resources/routes/*/name': {
    description: "Route's common name"
  },
  '/resources/routes/*/description': {
    description: 'A description of the route'
  },
  '/resources/routes/*/distance': {
    description: 'Total distance from start to end',
    units: 'm'
  },
  '/resources/routes/*/start': {
    description: 'The waypoint UUID at the start of the route'
  },
  '/resources/routes/*/end': {
    description: 'The waypoint UUID at the end of the route'
  },
  '/resources/routes/*/feature': {
    description:
      'A Geo JSON feature object which describes the route between the waypoints'
  },
  '/resources/routes/*/feature/type': {
    description: '[missing]',
    enum: ['Feature']
  },
  '/resources/routes/*/feature/geometry': {
    description: '[missing]'
  },
  '/resources/routes/*/feature/geometry/type': {
    description: '[missing]',
    enum: ['LineString']
  },
  '/resources/routes/*/feature/geometry/coordinates': {
    description: 'An array of two or more positions'
  },
  '/resources/routes/*/feature/properties': {
    description: 'Additional data of any type'
  },
  '/resources/routes/*/feature/id': {
    description: '[missing]'
  },
  '/resources/notes': {
    description:
      'A holder for notes about regions, each named with a UUID. Notes might include navigation or cruising info, images, or anything'
  },
  '/resources/notes/*': {
    description:
      'A note about a region, named with a UUID. Notes might include navigation or cruising info, images, or anything'
  },
  '/resources/notes/*/title': {
    description: "Note's common name"
  },
  '/resources/notes/*/description': {
    description: 'A textual description of the note'
  },
  '/resources/notes/*/region': {
    description:
      'Region related to note. A pointer to a region UUID. Alternative to position or geohash'
  },
  '/resources/notes/*/position': {
    description: 'Position related to note. Alternative to region or geohash',
    properties: {
      longitude: {
        type: 'number',
        description: 'Longitude',
        units: 'deg',
        example: 4.98765245
      },
      latitude: {
        type: 'number',
        description: 'Latitude',
        units: 'deg',
        example: 52.0987654
      },
      altitude: {
        type: 'number',
        description: 'Altitude',
        units: 'm'
      }
    }
  },
  '/resources/notes/*/geohash': {
    description: 'Position related to note. Alternative to region or position'
  },
  '/resources/notes/*/mimeType': {
    description: 'MIME type of the note'
  },
  '/resources/notes/*/url': {
    description: 'Location of the note'
  },
  '/resources/regions': {
    description: 'A holder for regions, each named with UUID'
  },
  '/resources/regions/*': {
    description: 'A region of interest, each named with a UUID'
  },
  '/resources/regions/*/geohash': {
    description: 'geohash of the approximate boundary of this region'
  },
  '/resources/regions/*/feature': {
    description:
      'A Geo JSON feature object which describes the regions boundary'
  },
  '/resources/regions/*/feature/type': {
    description: '[missing]',
    enum: ['Feature']
  },
  '/resources/regions/*/feature/geometry': {
    description: '[missing]'
  },
  '/resources/regions/*/feature/properties': {
    description: 'Additional data of any type'
  },
  '/resources/regions/*/feature/id': {
    description: '[missing]'
  },
  '/resources/waypoints': {
    description: 'A holder for waypoints, each named with a UUID'
  },
  '/resources/waypoints/*': {
    description: 'A waypoint, named with a UUID'
  },
  '/resources/waypoints/*/position': {
    description: 'The position in 3 dimensions',
    properties: {
      longitude: {
        type: 'number',
        description: 'Longitude',
        units: 'deg',
        example: 4.98765245
      },
      latitude: {
        type: 'number',
        description: 'Latitude',
        units: 'deg',
        example: 52.0987654
      },
      altitude: {
        type: 'number',
        description: 'Altitude',
        units: 'm'
      }
    }
  },
  '/resources/waypoints/*/feature': {
    description: 'A Geo JSON feature object'
  },
  '/resources/waypoints/*/feature/type': {
    description: '[missing]',
    enum: ['Feature']
  },
  '/resources/waypoints/*/feature/geometry': {
    description: '[missing]'
  },
  '/resources/waypoints/*/feature/geometry/type': {
    description: '[missing]',
    enum: ['Point']
  },
  '/resources/waypoints/*/feature/geometry/coordinates': {
    description: 'A single position, in x,y order (Lon, Lat)'
  },
  '/resources/waypoints/*/feature/properties': {
    description: 'Additional data of any type'
  },
  '/resources/waypoints/*/feature/id': {
    description: '[missing]'
  },
  '/version': {
    description:
      'Version of the schema and APIs that this data is using in Canonical format i.e. V1.5.0.'
  }
}
