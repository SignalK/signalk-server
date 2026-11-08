import { expect } from 'chai'
import { Type } from '@sinclair/typebox'
import { typeboxToOpenApiSchemas } from '../src/api/openApiSchemas'
import { notificationsApiRecord } from '../src/api/notifications/openApi'
import { bleApiRecord } from '../src/api/ble/openApi'

const nullOnly = { type: 'object', nullable: true, enum: [null] }

function convert(schema: object) {
  return typeboxToOpenApiSchemas([{ ...schema, $id: 'Test' }]).Test
}

function findUnsupported(node: unknown, path: string, found: string[]) {
  if (node === null || typeof node !== 'object') return
  if (Array.isArray(node)) {
    node.forEach((item, i) => findUnsupported(item, `${path}/${i}`, found))
    return
  }
  const obj = node as Record<string, unknown>
  if ('patternProperties' in obj) found.push(`${path} patternProperties`)
  if (
    obj.type === 'null' ||
    (Array.isArray(obj.type) && obj.type.includes('null'))
  ) {
    found.push(`${path} type null`)
  }
  if (obj.nullable === true && typeof obj.type !== 'string') {
    found.push(`${path} nullable without type`)
  }
  for (const [key, value] of Object.entries(obj)) {
    findUnsupported(value, `${path}/${key}`, found)
  }
}

describe('typeboxToOpenApiSchemas OpenAPI 3.0 output', () => {
  it('turns a Record into additionalProperties', () => {
    expect(
      convert(Type.Record(Type.String(), Type.Number(), { description: 'd' }))
    ).to.deep.equal({
      description: 'd',
      type: 'object',
      additionalProperties: { type: 'number' }
    })
  })

  it('keeps a $ref inside a Record value', () => {
    const Item = Type.Object({ a: Type.String() }, { $id: 'Item' })
    expect(convert(Type.Record(Type.String(), Item))).to.deep.equal({
      type: 'object',
      additionalProperties: { $ref: '#/components/schemas/Item' }
    })
  })

  it('combines several patterns and an existing additionalProperties', () => {
    expect(
      convert({
        type: 'object',
        patternProperties: {
          '^a': { type: 'string' },
          '^b': { type: 'number' }
        },
        additionalProperties: { type: 'boolean' }
      })
    ).to.deep.equal({
      type: 'object',
      additionalProperties: {
        anyOf: [{ type: 'string' }, { type: 'number' }, { type: 'boolean' }]
      }
    })
  })

  it('turns a union with null into a nullable schema', () => {
    expect(
      convert(Type.Union([Type.Number(), Type.Null()], { description: 'when' }))
    ).to.deep.equal({ description: 'when', type: 'number', nullable: true })
  })

  it('keeps null as an alternative to a $ref member', () => {
    const Item = Type.Object({ a: Type.String() }, { $id: 'Item' })
    expect(convert(Type.Union([Item, Type.Null()]))).to.deep.equal({
      anyOf: [{ $ref: '#/components/schemas/Item' }, nullOnly]
    })
  })

  it('keeps null as an alternative to several members', () => {
    expect(
      convert(Type.Union([Type.String(), Type.Number(), Type.Null()]))
    ).to.deep.equal({
      anyOf: [{ type: 'string' }, { type: 'number' }, nullOnly]
    })
  })

  it('keeps null as an alternative to an enum member', () => {
    expect(convert(Type.Union([Type.Literal('a'), Type.Null()]))).to.deep.equal(
      { anyOf: [{ type: 'string', enum: ['a'] }, nullOnly] }
    )
  })

  it('turns a type array with null into a nullable type', () => {
    expect(convert({ type: ['string', 'null'] })).to.deep.equal({
      type: 'string',
      nullable: true
    })
  })

  it('converts nested schemas', () => {
    expect(
      convert(
        Type.Object({
          data: Type.Record(
            Type.String(),
            Type.Union([Type.String(), Type.Null()])
          )
        })
      )
    ).to.deep.equal({
      type: 'object',
      required: ['data'],
      properties: {
        data: {
          type: 'object',
          additionalProperties: { type: 'string', nullable: true }
        }
      }
    })
  })

  it('leaves no unsupported null or pattern schemas in the built-in API docs', () => {
    const found: string[] = []
    for (const record of [notificationsApiRecord, bleApiRecord]) {
      findUnsupported(record.apiDoc, record.name, found)
    }
    expect(found).to.deep.equal([])
  })
})
