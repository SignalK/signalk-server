import { BehaviorSubject } from "rxjs"

export class StreamBundle {
  constructor(selfId) {
    this.selfId = selfId
    this.observables = {}
    this.newStreamsObservable = new BehaviorSubject()
    }
  handleDelta(delta) {
    delta.updates && delta.updates.forEach(update => {
      update.values && update.values.forEach(pathValue => {
        this.getObservable(pathValue.path, update.$source, delta.context).next({
          path: pathValue.path,
          value: pathValue.value,
          context: delta.context,
          source: update.source,
          $source: update.$source,
          timestamp: update.timestamp
        })
      })
    })
  }

  getNewStreamsObservable() {
    return this.newStreamsObservable
  }

  getObservable(path, dollarSource, context) {
    const bundleKey = `${path}${dollarSource}${context || this.selfId}`
    let streamHolder = this.observables[bundleKey]
    if (!streamHolder) {
      streamHolder = this.observables[bundleKey] = {
        path,
        dollarSource,
        context,
        observable: new BehaviorSubject()
      }
      this.newStreamsObservable.next(Object.values(this.observables))
    }
    return streamHolder.observable
  }
}