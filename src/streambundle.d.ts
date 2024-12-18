/* eslint-disable @typescript-eslint/no-explicit-any */
import { Path } from '@signalk/server-api'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const toDelta: any

export class StreamBundle {
  constructor(app: any, selfId: string)
  getSelfStream: (path: Path) => any
  getMetaBus: () => any
  getSelfMetaBus: () => any
}
