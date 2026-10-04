import { expect } from 'chai'
import { Watcher } from '../../packages/course-provider-plugin/src/alarms'

describe('Watcher', () => {
  it('emits enter when value moves into range', () => {
    const watcher = new Watcher()
    watcher.rangeMin = 10
    watcher.rangeMax = 20

    const events: string[] = []
    watcher.change$.subscribe((event) => events.push(event.type))

    watcher.value = 5
    watcher.value = 15

    expect(events).to.deep.equal(['enter'])
  })

  it('emits exit when value moves out of range', () => {
    const watcher = new Watcher()
    watcher.rangeMin = 10
    watcher.rangeMax = 20

    const events: string[] = []
    watcher.change$.subscribe((event) => events.push(event.type))

    watcher.value = 15
    watcher.value = 25

    expect(events).to.deep.equal(['enter', 'exit'])
  })
})
