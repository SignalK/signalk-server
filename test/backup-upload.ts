import { expect } from 'chai'
import { startServer } from './ts-servertestutilities'

describe('Backup upload', () => {
  it('rejects a part without a filename', async function () {
    const { host, stop } = await startServer()
    try {
      // busboy hands a part with no filename to the file handler when its
      // content type is application/octet-stream.
      const body =
        '--x\r\n' +
        'Content-Disposition: form-data; name="file"\r\n' +
        'Content-Type: application/octet-stream\r\n\r\n' +
        'data\r\n' +
        '--x--\r\n'
      const response = await fetch(`${host}/skServer/validateBackup`, {
        method: 'POST',
        body,
        headers: { 'Content-Type': 'multipart/form-data; boundary=x' }
      })
      expect(response.status).to.equal(400)
    } finally {
      await stop()
    }
  })
})
