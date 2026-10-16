import { expect } from 'chai'
import { FromPgn } from '@canboat/canboatjs'
import { N2kMapper } from '@signalk/n2k-signalk'
import { startServer } from './ts-servertestutilities'

const DELTA_SETTLE_MS = 200
// PGN 128267 captured from an Airmar DST810 with a keel offset of
// -1.000 m programmed into the transducer: depth 13.08 m below it.
const DST810_KEEL_FRAME =
  '2026-10-13T19:52:31.815Z,3,128267,35,255,8,ff,1c,05,00,00,18,fc,0e'
const DRAFT = 1.7
// The test delta endpoint labels a source-object update by its N2K address.
const SOURCE = 'deltaFromHttp.35'

const settle = () => new Promise((r) => setTimeout(r, DELTA_SETTLE_MS))

describe('Depth derivation through the server', () => {
  it('publishes belowSurface for a keel-mode transducer next to its own source', async () => {
    const { server, sendADelta, getV1, stop } = await startServer()
    try {
      server.app.signalk.self.design = {
        draft: { value: { maximum: DRAFT } }
      }
      const n2k = new FromPgn({ useCamelCompat: true }).parseString(
        DST810_KEEL_FRAME
      )
      const converted = new N2kMapper({ app: {} }).toDelta(n2k)
      expect(converted).to.not.equal(undefined)
      await sendADelta({
        context: 'vessels.self',
        updates: converted!.updates
      })
      await settle()

      const belowSurface = await getV1(
        '/vessels/self/environment/depth/belowSurface'
      ).then((r: Response) => r.json())
      expect(belowSurface.$source).to.equal(`${SOURCE}.derived`)
      expect(belowSurface.timestamp).to.equal('2026-10-13T19:52:31.815Z')
      expect(belowSurface.value).to.be.closeTo(13.78, 1e-9)

      const belowKeel = await getV1(
        '/vessels/self/environment/depth/belowKeel'
      ).then((r: Response) => r.json())
      expect(belowKeel.$source).to.equal(SOURCE)
      expect(belowKeel.value).to.be.closeTo(12.08, 1e-9)
    } finally {
      await stop()
    }
  })
})
