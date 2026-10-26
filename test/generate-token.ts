import { expect } from 'chai'
import { execFileSync, spawnSync } from 'child_process'
import fs from 'fs'
import jwt from 'jsonwebtoken'
import os from 'os'
import path from 'path'

const BIN = path.join(__dirname, '..', 'bin', 'signalk-generate-token')

function generate(securityPath: string) {
  return execFileSync(
    process.execPath,
    [BIN, '-u', 'admin', '-e', '1y', '-s', securityPath],
    { encoding: 'utf8' }
  ).trim()
}

function run(securityPath: string) {
  return spawnSync(
    process.execPath,
    [BIN, '-u', 'admin', '-e', '1y', '-s', securityPath],
    { encoding: 'utf8' }
  )
}

describe('signalk-generate-token', () => {
  let dir: string
  let securityPath: string

  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'sk-generate-token-'))
    securityPath = path.join(dir, 'security.json')
  })

  afterEach(() => {
    fs.rmSync(dir, { recursive: true, force: true })
  })

  it('signs with security-secret.key when security.json has no secretKey', () => {
    fs.writeFileSync(securityPath, JSON.stringify({ users: [] }))
    fs.writeFileSync(path.join(dir, 'security-secret.key'), 'filekey\n')

    const payload = jwt.verify(
      generate(securityPath),
      'filekey'
    ) as jwt.JwtPayload
    expect(payload.id).to.equal('admin')
  })

  it('signs with the secretKey in security.json when it has one', () => {
    fs.writeFileSync(
      securityPath,
      JSON.stringify({ secretKey: 'jsonkey', users: [] })
    )
    fs.writeFileSync(path.join(dir, 'security-secret.key'), 'filekey')

    const payload = jwt.verify(
      generate(securityPath),
      'jsonkey'
    ) as jwt.JwtPayload
    expect(payload.id).to.equal('admin')
  })

  it('exits non-zero without printing a token when no key exists', () => {
    fs.writeFileSync(securityPath, JSON.stringify({ users: [] }))

    const result = run(securityPath)
    expect(result.status).to.equal(1)
    expect(result.stdout).to.equal('')
    expect(result.stderr).to.contain('security-secret.key')
  })

  it('exits non-zero without printing a token when the key file cannot be read', () => {
    fs.writeFileSync(securityPath, JSON.stringify({ users: [] }))
    fs.mkdirSync(path.join(dir, 'security-secret.key'))

    const result = run(securityPath)
    expect(result.status).to.equal(1)
    expect(result.stdout).to.equal('')
    expect(result.stderr).to.contain('Could not read')
  })

  it('exits non-zero when security.json cannot be parsed', () => {
    fs.writeFileSync(securityPath, '{ not json')
    fs.writeFileSync(path.join(dir, 'security-secret.key'), 'filekey')

    const result = run(securityPath)
    expect(result.status).to.equal(1)
    expect(result.stdout).to.equal('')
  })
})
