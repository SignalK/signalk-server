const chai = require('chai')
chai.Should()
chai.use(require('chai-things'))
const assert = require('assert')

const securitySettings = {
  acls: [
    {
      context: 'vessels.self',
      paths: [
        {
          paths: ['navigation.*', 'name', 'design.aisShipType'],
          permissions: [
            {
              subject: 'any',
              permission: 'read'
            },
            {
              subject: 'sbender',
              permission: 'write'
            }
          ]
        }
      ]
    },
    {
      context: 'vessels.123456789',
      paths: [
        {
          paths: [
            'navigation.courseOverGroundTrue',
            'navigation.position',
            'navigation.speedOverGround',
            'name',
            'design.aisShipType'
          ],
          permissions: [
            {
              subject: 'any',
              permission: 'read'
            },
            {
              subject: 'sbender',
              permission: 'write'
            }
          ]
        },
        {
          paths: ['*'],
          permissions: [
            {
              subject: 'sbender',
              permission: 'write'
            }
          ]
        }
      ]
    },
    {
      context: 'vessels.*',
      paths: [
        {
          paths: ['*'],
          permissions: [
            {
              subject: 'any',
              permission: 'read'
            }
          ]
        }
      ]
    }
  ]
}

const dummyApp = {
  use: () => {},
  get: () => {},
  post: () => {},
  put: () => {}
}

const securityStrategy = require('../lib/tokensecurity')(
  dummyApp,
  securitySettings
)

describe('access control lists work', function () {
  it('vessels.self navigation.position write fails', () => {
    assert(
      securityStrategy.checkACL(
        'john.doe',
        'vessels.self',
        'navigation.position',
        'write'
      ) === false
    )
  })

  it('vessels.self navigation.position write works', () => {
    assert(
      securityStrategy.checkACL(
        'sbender',
        'vessels.self',
        'navigation.position',
        'write'
      )
    )
  })

  it('vessels.self navigation.position read works', () => {
    assert(
      securityStrategy.checkACL(
        'john.doe',
        'vessels.self',
        'navigation.position',
        'read'
      )
    )
    assert(
      securityStrategy.checkACL(
        'sbender',
        'vessels.self',
        'navigation.position',
        'read'
      )
    )
  })

  it('vessels.self name read works', () => {
    assert(
      securityStrategy.checkACL('john.doe', 'vessels.self', 'name', 'read')
    )
    assert(securityStrategy.checkACL('sbender', 'vessels.self', 'name', 'read'))
  })

  it('vessels.123456789 name read works', () => {
    assert(
      securityStrategy.checkACL('john.doe', 'vessels.123456789', 'name', 'read')
    )
    assert(
      securityStrategy.checkACL('sbender', 'vessels.123456789', 'name', 'read')
    )
  })

  it('vessels.123456789 position read works', () => {
    assert(
      securityStrategy.checkACL('john.doe', 'vessels.123456789', 'name', 'read')
    )
    assert(
      securityStrategy.checkACL('sbender', 'vessels.123456789', 'name', 'read')
    )
  })

  it('vessels.123456789 navigation.logTrip read', () => {
    assert(
      securityStrategy.checkACL(
        'john.doe',
        'vessels.123456789',
        'navigation.logTrip',
        'read'
      ) === false
    )
    assert(
      securityStrategy.checkACL(
        'sbender',
        'vessels.123456789',
        'navigation.logTrip',
        'read'
      )
    )
  })

  it('vessels.123456789 navigation.logTrip write', () => {
    assert(
      securityStrategy.checkACL(
        'john.doe',
        'vessels.123456789',
        'navigation.logTrip',
        'write'
      ) === false
    )
    assert(
      securityStrategy.checkACL(
        'sbender',
        'vessels.123456789',
        'navigation.logTrip',
        'write'
      )
    )
  })

  it('vessels.987654321 navigation.logTrip write', () => {
    assert(
      securityStrategy.checkACL(
        'john.doe',
        'vessels.987654321',
        'navigation.logTrip',
        'write'
      ) === false
    )
    assert(
      securityStrategy.checkACL(
        'john.doe',
        'vessels.987654321',
        'navigation.logTrip',
        'read'
      )
    )
  })
})
