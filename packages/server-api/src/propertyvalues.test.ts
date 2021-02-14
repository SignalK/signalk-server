import { expect } from 'chai'
import{ PropertyValue, PropertyValues } from './propertyvalues'

const setupTest = (done: () => any, startAt: number) => {
  const testValues = [
    {
      timestamp: Date.now(),
      name: 'foo',
      setter: 'pluginX',
      value: 1
    }
  ]
  const pv = new PropertyValues()
  let cbCount = 0
  const cb = (values: PropertyValue[]) => {
    expect(values).to.deep.equal([
      undefined,
      ...testValues.slice(0, startAt + cbCount++)
    ])
    if (cbCount === testValues.length) {
      done()
    }
  }

  return { pv, cb, testValues }
}

describe('PropertyValues', () => {
  it('early subscriptions work', done => {
    const { pv, cb, testValues } = setupTest(done, 0)
    // subscribe, then emit
    pv.onPropertyValues('foo', cb)
    pv.emitPropertyValue(testValues[0])
  })

  it('late subscriptions work', done => {
    const { pv, cb, testValues } = setupTest(done, 1)
    // emit, then subscribe
    pv.emitPropertyValue(testValues[0])
    pv.onPropertyValues('foo', cb)
  })
})
