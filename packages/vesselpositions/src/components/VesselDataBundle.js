import { BehaviorSubject, Subject } from "rxjs"
import { map, throttleTime, scan, withLatestFrom } from "rxjs/operators"

export default class VesselDataBundle {
  constructor() {
    this.positionSubject = new Subject()
    this.accumulatedTrack = this.positionSubject.pipe(
      throttleTime(5 * 1000),
      scan((acc, position) => {
        acc.push(position)
        return acc
      }, [])
    )
    this.uptodateTrack = this.positionSubject.pipe(
      withLatestFrom(this.accumulatedTrack),
      map(([latestPosition, earlierTrack]) => [...earlierTrack, latestPosition])
    )
    this.headingSubject = new BehaviorSubject(0)
    this.nameSubject = new BehaviorSubject('-')
  }

  nextPosition(posObject) {
    const latLng = [posObject.latitude, posObject.longitude]
    this.positionSubject.next(latLng)
  }

  nextHeading(heading) {
    this.headingSubject.next(heading)
  }

  setName(name) {
    this.nameSubject.next(name)
  }
}
