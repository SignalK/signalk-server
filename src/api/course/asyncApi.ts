import {
  ActiveRouteSchema,
  NextPreviousPointSchema,
  PositionSchema,
  IsoTimeSchema,
  ArrivalCircleSchema,
  CoursePointTypeSchema
} from '@signalk/server-api/typebox'
import { Type } from '@sinclair/typebox'

// eslint-disable-next-line @typescript-eslint/no-require-imports
const serverVersion: string = require('../../../' + 'package.json').version

export const courseAsyncApiDoc = {
  asyncapi: '3.0.0',
  info: {
    title: 'Signal K Course API - WebSocket Deltas',
    version: serverVersion,
    description: `
WebSocket delta channels for the Signal K Course API.

## Protocol Versions
- **v2** (recommended): Deltas under \`navigation.course.*\`
- **v1** (legacy): Deltas under \`navigation.courseGreatCircle.*\` and
  \`navigation.courseRhumbline.*\` (duplicated for both calculation methods)

## Subscribing
\`\`\`json
{
  "context": "vessels.self",
  "subscribe": [
    { "path": "navigation.course.*", "period": 1000 }
  ]
}
\`\`\`

## REST API
For the REST API documentation, see OpenAPI at \`/admin/openapi/\`.
    `.trim(),
    license: {
      name: 'Apache 2.0',
      url: 'https://www.apache.org/licenses/LICENSE-2.0.html'
    }
  },
  servers: {
    signalk: {
      host: 'localhost:3000',
      protocol: 'ws',
      description: 'Signal K server WebSocket endpoint',
      pathname: '/signalk/v2/stream'
    }
  },
  channels: {
    'navigation.course': {
      address: 'navigation.course',
      description:
        'v2 course delta channel. Emits when course state changes (destination set/cleared, route operations, arrival circle changes).',
      messages: {
        startTime: {
          name: 'navigation.course.startTime',
          title: 'Course Start Time',
          summary:
            'Time at which navigation to the current destination commenced',
          contentType: 'application/json',
          payload: Type.Union([IsoTimeSchema, Type.Null()])
        },
        targetArrivalTime: {
          name: 'navigation.course.targetArrivalTime',
          title: 'Target Arrival Time',
          summary: 'The desired time at which to arrive at the destination',
          contentType: 'application/json',
          payload: Type.Union([IsoTimeSchema, Type.Null()])
        },
        activeRoute: {
          name: 'navigation.course.activeRoute',
          title: 'Active Route',
          summary: 'Currently active route information',
          contentType: 'application/json',
          payload: Type.Union([ActiveRouteSchema, Type.Null()])
        },
        arrivalCircle: {
          name: 'navigation.course.arrivalCircle',
          title: 'Arrival Circle',
          summary: 'Radius of the arrival zone in meters',
          contentType: 'application/json',
          payload: ArrivalCircleSchema
        },
        previousPoint: {
          name: 'navigation.course.previousPoint',
          title: 'Previous Point',
          summary: 'The point the vessel is navigating from',
          contentType: 'application/json',
          payload: Type.Union([NextPreviousPointSchema, Type.Null()])
        },
        nextPoint: {
          name: 'navigation.course.nextPoint',
          title: 'Next Point',
          summary: 'The point the vessel is navigating towards',
          contentType: 'application/json',
          payload: Type.Union([NextPreviousPointSchema, Type.Null()])
        }
      }
    },
    'navigation.courseGreatCircle': {
      address: 'navigation.courseGreatCircle',
      description:
        'v1 course delta channel (Great Circle calculations). Mirrors courseRhumbline.',
      messages: {
        activeRouteHref: {
          name: 'navigation.courseGreatCircle.activeRoute.href',
          title: 'Active Route Href',
          contentType: 'application/json',
          payload: Type.Union([Type.String(), Type.Null()])
        },
        activeRouteStartTime: {
          name: 'navigation.courseGreatCircle.activeRoute.startTime',
          title: 'Active Route Start Time',
          contentType: 'application/json',
          payload: Type.Union([IsoTimeSchema, Type.Null()])
        },
        nextPointHref: {
          name: 'navigation.courseGreatCircle.nextPoint.value.href',
          title: 'Next Point Href',
          contentType: 'application/json',
          payload: Type.Union([Type.String(), Type.Null()])
        },
        nextPointType: {
          name: 'navigation.courseGreatCircle.nextPoint.value.type',
          title: 'Next Point Type',
          contentType: 'application/json',
          payload: Type.Union([CoursePointTypeSchema, Type.Null()])
        },
        nextPointPosition: {
          name: 'navigation.courseGreatCircle.nextPoint.position',
          title: 'Next Point Position',
          contentType: 'application/json',
          payload: Type.Union([PositionSchema, Type.Null()])
        },
        nextPointArrivalCircle: {
          name: 'navigation.courseGreatCircle.nextPoint.arrivalCircle',
          title: 'Arrival Circle',
          contentType: 'application/json',
          payload: ArrivalCircleSchema
        },
        previousPointPosition: {
          name: 'navigation.courseGreatCircle.previousPoint.position',
          title: 'Previous Point Position',
          contentType: 'application/json',
          payload: Type.Union([PositionSchema, Type.Null()])
        },
        previousPointType: {
          name: 'navigation.courseGreatCircle.previousPoint.value.type',
          title: 'Previous Point Type',
          contentType: 'application/json',
          payload: Type.Union([CoursePointTypeSchema, Type.Null()])
        }
      }
    },
    'navigation.courseRhumbline': {
      address: 'navigation.courseRhumbline',
      description:
        'v1 course delta channel (Rhumbline calculations). Mirrors courseGreatCircle.',
      messages: {
        activeRouteHref: {
          name: 'navigation.courseRhumbline.activeRoute.href',
          title: 'Active Route Href',
          contentType: 'application/json',
          payload: Type.Union([Type.String(), Type.Null()])
        },
        activeRouteStartTime: {
          name: 'navigation.courseRhumbline.activeRoute.startTime',
          title: 'Active Route Start Time',
          contentType: 'application/json',
          payload: Type.Union([IsoTimeSchema, Type.Null()])
        },
        nextPointHref: {
          name: 'navigation.courseRhumbline.nextPoint.value.href',
          title: 'Next Point Href',
          contentType: 'application/json',
          payload: Type.Union([Type.String(), Type.Null()])
        },
        nextPointType: {
          name: 'navigation.courseRhumbline.nextPoint.value.type',
          title: 'Next Point Type',
          contentType: 'application/json',
          payload: Type.Union([CoursePointTypeSchema, Type.Null()])
        },
        nextPointPosition: {
          name: 'navigation.courseRhumbline.nextPoint.position',
          title: 'Next Point Position',
          contentType: 'application/json',
          payload: Type.Union([PositionSchema, Type.Null()])
        },
        nextPointArrivalCircle: {
          name: 'navigation.courseRhumbline.nextPoint.arrivalCircle',
          title: 'Arrival Circle',
          contentType: 'application/json',
          payload: ArrivalCircleSchema
        },
        previousPointPosition: {
          name: 'navigation.courseRhumbline.previousPoint.position',
          title: 'Previous Point Position',
          contentType: 'application/json',
          payload: Type.Union([PositionSchema, Type.Null()])
        },
        previousPointType: {
          name: 'navigation.courseRhumbline.previousPoint.value.type',
          title: 'Previous Point Type',
          contentType: 'application/json',
          payload: Type.Union([CoursePointTypeSchema, Type.Null()])
        }
      }
    }
  },
  operations: {
    receiveCourseV2: {
      action: 'receive',
      channel: { $ref: '#/channels/navigation.course' },
      summary: 'Receive v2 course delta updates',
      description:
        'Emitted when course state changes. Contains path values under navigation.course.*'
    },
    receiveCourseGreatCircle: {
      action: 'receive',
      channel: { $ref: '#/channels/navigation.courseGreatCircle' },
      summary: 'Receive v1 course delta updates (Great Circle)'
    },
    receiveCourseRhumbline: {
      action: 'receive',
      channel: { $ref: '#/channels/navigation.courseRhumbline' },
      summary: 'Receive v1 course delta updates (Rhumbline)'
    }
  }
}
