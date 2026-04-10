const http = require('http')
const { compile } = require('mathjs')
const loader = require('./dist/unitpreferences/loader')
loader.setApplicationDataPath(require('os').homedir() + '/.signalk')
loader.loadAll()

const users = [
  { name: 'maurice', password: 'Z3nn0r@~' },
  { name: 'mo', password: '123456' },
  { name: 'rima', password: '123456' },
  { name: 'mo2', password: '123456' }
]

const testPaths = ['test/aDist', 'test/aVolume']

function httpPost(url, body) {
  return new Promise((resolve, reject) => {
    const u = new URL(url)
    const data = JSON.stringify(body)
    const req = http.request({
      hostname: u.hostname, port: u.port, path: u.pathname,
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Content-Length': data.length }
    }, res => {
      let d = ''
      res.on('data', c => d += c)
      res.on('end', () => { try { resolve(JSON.parse(d)) } catch { resolve(null) } })
    })
    req.on('error', reject)
    req.write(data)
    req.end()
  })
}

function httpGet(url, token) {
  return new Promise((resolve, reject) => {
    const u = new URL(url)
    const opts = {
      hostname: u.hostname, port: u.port, path: u.pathname,
      headers: token ? { 'Authorization': 'Bearer ' + token } : {}
    }
    http.get(opts, res => {
      let d = ''
      res.on('data', c => d += c)
      res.on('end', () => { try { resolve(JSON.parse(d)) } catch { resolve(null) } })
    }).on('error', reject)
  })
}

async function run() {
  // Login all users
  for (const u of users) {
    const resp = await httpPost('http://0.0.0.0:3000/login', { username: u.name, password: u.password })
    u.token = resp?.token
    if (!u.token) {
      console.log('FAILED to login ' + u.name)
      return
    }
  }

  for (const p of testPaths) {
    const skPath = p.replace(/\//g, '.')
    console.log('='.repeat(70))
    console.log('PATH: ' + skPath)
    console.log('='.repeat(70))

    for (const u of users) {
      const preset = loader.getActivePresetForUser(u.name)
      const primaryM = loader.getCategoryForBaseUnit('m', u.name)
      const primaryM3 = loader.getCategoryForBaseUnit('m3', u.name)

      const data = await httpGet('http://0.0.0.0:3000/signalk/v1/api/vessels/self/' + p, u.token)
      const meta = await httpGet('http://0.0.0.0:3000/signalk/v1/api/vessels/self/' + p + '/meta', u.token)

      const rawValue = data?.value
      const baseUnit = meta?.units || 'unknown'
      const du = meta?.displayUnits

      let converted = 'N/A'
      if (du?.formula && rawValue !== undefined) {
        try {
          const expr = compile(du.formula)
          converted = Number(expr.evaluate({ value: rawValue }).toFixed(4))
        } catch (e) { converted = 'error: ' + e.message }
      }

      console.log('')
      console.log('  User:            ' + u.name)
      console.log('  Preset:          ' + preset.name)
      console.log('  Primary for m:   ' + primaryM)
      console.log('  Primary for m3:  ' + primaryM3)
      console.log('  Base unit:       ' + baseUnit)
      console.log('  Raw value:       ' + rawValue + ' ' + baseUnit)
      console.log('  Category:        ' + (du?.category || 'NONE'))
      console.log('  Target unit:     ' + (du?.targetUnit || 'NONE'))
      console.log('  Symbol:          ' + (du?.symbol || 'NONE'))
      console.log('  Converted:       ' + converted + ' ' + (du?.symbol || ''))
    }
    console.log('')
  }
}

run().catch(console.error)
