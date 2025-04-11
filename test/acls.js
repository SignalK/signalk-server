import chai from 'chai'
import assert from 'assert'
import chaiThings from 'chai-things'
import tokenSecurity from '../dist/tokensecurity.js'
chai.Should()
chai.use(chaiThings)

const securitySettings = {
  acls: [
    {
      context: 'vessels.self',
      resources: [
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
        },
        {
          sources: ['source.1'],
          permissions: [
            {
              subject: 'any',
              permission: 'read'
            }
          ]
        },
        {
          paths: ['electrical.controls.venus-0.state'],
          permissions: [
            {
              subject: 'any',
              permission: 'read'
            },
            {
              subject: 'sbender',
              permission: 'put'
            }
          ]
        }
      ]
    },
    {
      context: 'vessels.123456789',
      resources: [
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
      resources: [
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

const securityStrategy = tokenSecurity(dummyApp, securitySettings)

describe('access control lists work', function () {
  it('vessels.self navigation.position write fails', () => {
    assert(
      securityStrategy.checkACL(
        'john.doe',
        'vessels.self',
        'navigation.position',
        'test',
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
        'test',
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
        'test',
        'read'
      )
    )
    assert(
      securityStrategy.checkACL(
        'sbender',
        'vessels.self',
        'navigation.position',
        'test',
        'read'
      )
    )
  })

  it('vessels.self name read works', () => {
    assert(
      securityStrategy.checkACL(
        'john.doe',
        'vessels.self',
        'name',
        'test',
        'read'
      )
    )
    assert(
      securityStrategy.checkACL(
        'sbender',
        'vessels.self',
        'name',
        'test',
        'read'
      )
    )
  })

  it('vessels.123456789 name read works', () => {
    assert(
      securityStrategy.checkACL(
        'john.doe',
        'vessels.123456789',
        'name',
        'test',
        'read'
      )
    )
    assert(
      securityStrategy.checkACL(
        'sbender',
        'vessels.123456789',
        'name',
        'test',
        'read'
      )
    )
  })

  it('vessels.123456789 position read works', () => {
    assert(
      securityStrategy.checkACL(
        'john.doe',
        'vessels.123456789',
        'name',
        'test',
        'read'
      )
    )
    assert(
      securityStrategy.checkACL(
        'sbender',
        'vessels.123456789',
        'name',
        'test',
        'read'
      )
    )
  })

  it('vessels.123456789 navigation.logTrip read', () => {
    assert(
      securityStrategy.checkACL(
        'john.doe',
        'vessels.123456789',
        'navigation.logTrip',
        'test',
        'read'
      ) === false
    )
    assert(
      securityStrategy.checkACL(
        'sbender',
        'vessels.123456789',
        'navigation.logTrip',
        'test',
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
        'test',
        'write'
      ) === false
    )
    assert(
      securityStrategy.checkACL(
        'sbender',
        'vessels.123456789',
        'navigation.logTrip',
        'test',
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
        'test',
        'write'
      ) === false
    )
    assert(
      securityStrategy.checkACL(
        'john.doe',
        'vessels.987654321',
        'navigation.logTrip',
        'test',
        'read'
      )
    )
  })

  it('vessels.self source acl works ', () => {
    assert(
      securityStrategy.checkACL(
        'john.doe',
        'vessels.self',
        null,
        'source.1',
        'write'
      ) === false
    )
    assert(
      securityStrategy.checkACL(
        'john.doe',
        'vessels.self',
        null,
        'source.2',
        'read'
      ) === false
    )
    assert(
      securityStrategy.checkACL(
        'john.doe',
        'vessels.self',
        null,
        'source.1',
        'read'
      )
    )
  })

  it('vessels.self put acl works ', () => {
    assert(
      securityStrategy.checkACL(
        'john.doe',
        'vessels.self',
        'electrical.controls.venus-0.state',
        null,
        'put'
      ) === false
    )
    assert(
      securityStrategy.checkACL(
        'sbender',
        'vessels.self',
        'electrical.controls.venus-0.state',
        null,
        'put'
      )
    )
  })
})
