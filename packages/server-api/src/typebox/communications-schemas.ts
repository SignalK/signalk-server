import { Type, Static } from '@sinclair/typebox'

export const MessageDispositionSchema = Type.Object({
  acknowledgedAt: Type.Optional(Type.String({ format: 'date-time' })),
  clearedAt: Type.Optional(Type.String({ format: 'date-time' }))
})

export const DscPayloadSchema = Type.Object({
  format: Type.String(),
  category: Type.Union([
    Type.Literal('distress'),
    Type.Literal('urgency'),
    Type.Literal('safety'),
    Type.Literal('routine'),
    Type.Literal('unknown')
  ]),
  natureOfDistress: Type.Optional(Type.String()),
  distressMmsi: Type.Optional(Type.String()),
  reportedTime: Type.Optional(Type.String())
})

export const MessageLogEntrySchema = Type.Object({
  id: Type.String(),
  type: Type.Literal('dsc'),
  receivedAt: Type.String({ format: 'date-time' }),
  sourceRef: Type.Optional(Type.String()),
  transport: Type.Optional(
    Type.Union([Type.Literal('nmea0183'), Type.Literal('nmea2000')])
  ),
  priority: Type.Union([
    Type.Literal('distress'),
    Type.Literal('urgency'),
    Type.Literal('safety'),
    Type.Literal('routine')
  ]),
  sender: Type.Object({
    mmsi: Type.Optional(Type.String()),
    name: Type.Optional(Type.String())
  }),
  subject: Type.Optional(Type.Object({ mmsi: Type.Optional(Type.String()) })),
  position: Type.Optional(
    Type.Object({
      latitude: Type.Number(),
      longitude: Type.Number()
    })
  ),
  summary: Type.String(),
  payload: DscPayloadSchema,
  raw: Type.String(),
  notificationId: Type.Optional(Type.String()),
  disposition: MessageDispositionSchema
})

export const MessageLogListSchema = Type.Array(MessageLogEntrySchema)

export type MessageLogEntryStatic = Static<typeof MessageLogEntrySchema>
