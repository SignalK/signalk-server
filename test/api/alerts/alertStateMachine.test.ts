import { expect } from 'chai'
import {
  AlertStateMachine,
  createAlert
} from '../../../src/api/alerts/alertStateMachine'
import type { Alert, AlertPriority } from '../../../src/api/alerts/types'
import {
  presentAlert,
  raiseParams,
  type RaiseOverrides
} from './helpers/fixtures'

describe('AlertStateMachine', () => {
  let stateMachine: AlertStateMachine

  beforeEach(() => {
    stateMachine = new AlertStateMachine()
  })

  function makeAlert(overrides: RaiseOverrides = {}): Alert {
    return createAlert(raiseParams(overrides))
  }

  describe('createAlert', () => {
    it('should create an alert in unacknowledged state', () => {
      const alert = makeAlert()

      expect(alert.state).to.equal('unacknowledged')
      expect(alert.condition).to.equal(true)
      expect(alert.silenced).to.equal(false)
    })

    it('should generate a unique ID', () => {
      const alert1 = makeAlert()
      const alert2 = makeAlert()

      expect(alert1.id).to.not.be.undefined
      expect(alert2.id).to.not.be.undefined
      expect(alert1.id).to.not.equal(alert2.id)
    })

    it('should set raisedAt timestamp', () => {
      const before = new Date().toISOString()
      const alert = makeAlert()
      const after = new Date().toISOString()

      expect(alert.raisedAt).to.not.be.undefined
      expect(alert.raisedAt >= before).to.equal(true)
      expect(alert.raisedAt <= after).to.equal(true)
    })

    it('should default latching to false', () => {
      const alert = makeAlert()
      expect(alert.latching).to.equal(false)
    })

    it('should accept latching parameter', () => {
      const alert = makeAlert({ latching: true })
      expect(alert.latching).to.equal(true)
    })

    it('should set sourceOnline to true', () => {
      const alert = makeAlert()
      expect(alert.sourceOnline).to.equal(true)
    })

    it('should set stale to false', () => {
      const alert = makeAlert()
      expect(alert.stale).to.equal(false)
    })

    it('should normalise an empty context to undefined', () => {
      // An empty context must key the alert index the same as an absent one
      const alert = makeAlert({ context: '' })
      expect(alert.context).to.be.undefined
    })
  })

  describe('acknowledge', () => {
    it('should transition from unacknowledged to acknowledged', () => {
      const alert = makeAlert()

      const result = stateMachine.acknowledge(alert)

      expect(result.cleared).to.equal(false)
      expect(result.previousState).to.equal('unacknowledged')
      expect(result.alert?.state).to.equal('acknowledged')
    })

    it('should set acknowledgedAt timestamp', () => {
      const alert = makeAlert()

      const result = stateMachine.acknowledge(alert)

      expect(result.alert?.acknowledgedAt).to.not.be.undefined
    })

    it('should set acknowledgedBy when userId provided', () => {
      const alert = makeAlert()

      const result = stateMachine.acknowledge(alert, 'operator-1')

      expect(result.alert?.acknowledgedBy).to.equal('operator-1')
    })

    it('should be idempotent on already-acknowledged alert', () => {
      const alert = makeAlert()
      const acked = presentAlert(stateMachine.acknowledge(alert).alert)

      const result = stateMachine.acknowledge(acked)

      expect(result.cleared).to.equal(false)
      expect(result.alert?.state).to.equal('acknowledged')
    })

    it('should clear RTN-unacknowledged alert', () => {
      const alert = makeAlert()
      const rtnAlert: Alert = {
        ...alert,
        state: 'rtn-unacknowledged',
        condition: false
      }

      const result = stateMachine.acknowledge(rtnAlert)

      expect(result.cleared).to.equal(true)
      expect(result.alert).to.be.null
    })

    it('should clear latched alert with cleared condition', () => {
      const alert = makeAlert({ latching: true })
      const latchedAlert: Alert = {
        ...alert,
        condition: false
      }

      const result = stateMachine.acknowledge(latchedAlert)

      expect(result.cleared).to.equal(true)
      expect(result.alert).to.be.null
    })

    it('should transition latched alert with active condition to acknowledged', () => {
      const alert = makeAlert({ latching: true })

      const result = stateMachine.acknowledge(alert)

      expect(result.cleared).to.equal(false)
      expect(result.alert?.state).to.equal('acknowledged')
    })
  })

  describe('clearCondition', () => {
    describe('for ack-required priorities (emergency, alarm, warning)', () => {
      const ackRequiredPriorities: AlertPriority[] = [
        'emergency',
        'alarm',
        'warning'
      ]

      ackRequiredPriorities.forEach((priority) => {
        it(`should transition ${priority} from unacknowledged to rtn-unacknowledged`, () => {
          const alert = makeAlert({ priority })

          const result = stateMachine.clearCondition(alert)

          expect(result.cleared).to.equal(false)
          expect(result.previousState).to.equal('unacknowledged')
          expect(result.alert?.state).to.equal('rtn-unacknowledged')
          expect(result.alert?.condition).to.equal(false)
        })
      })

      it('should clear acknowledged alert when condition clears', () => {
        const alert = makeAlert({ priority: 'alarm' })
        const acked = presentAlert(stateMachine.acknowledge(alert).alert)

        const result = stateMachine.clearCondition(acked)

        expect(result.cleared).to.equal(true)
        expect(result.alert).to.be.null
      })

      it('should set clearedAt timestamp when transitioning to RTN', () => {
        const alert = makeAlert({ priority: 'alarm' })

        const result = stateMachine.clearCondition(alert)

        expect(result.alert?.clearedAt).to.not.be.undefined
      })
    })

    describe('for caution priority', () => {
      it('should auto-clear caution alert without requiring ack', () => {
        const alert = makeAlert({ priority: 'caution' })

        const result = stateMachine.clearCondition(alert)

        expect(result.cleared).to.equal(true)
        expect(result.alert).to.be.null
      })

      it('should clear a caution whose condition is already false', () => {
        // A caution never waits for an acknowledgment, so the auto-clear has
        // to win over the idempotence check whatever state the alert is in.
        const alert = makeAlert({ priority: 'caution' })
        const held: Alert = { ...alert, condition: false }

        const result = stateMachine.clearCondition(held)

        expect(result.cleared).to.equal(true)
        expect(result.alert).to.be.null
      })

      it('should clear acknowledged caution alert', () => {
        const alert = makeAlert({ priority: 'caution' })
        const acked = presentAlert(stateMachine.acknowledge(alert).alert)

        const result = stateMachine.clearCondition(acked)

        expect(result.cleared).to.equal(true)
        expect(result.alert).to.be.null
      })
    })

    describe('for latched alerts', () => {
      it('should keep latched alert in unacknowledged state when condition clears', () => {
        const alert = makeAlert({ latching: true, priority: 'alarm' })

        const result = stateMachine.clearCondition(alert)

        expect(result.cleared).to.equal(false)
        expect(result.alert?.state).to.equal('unacknowledged')
        expect(result.alert?.condition).to.equal(false)
      })

      it('should clear acknowledged latched alert when condition clears', () => {
        const alert = makeAlert({ latching: true, priority: 'alarm' })
        const acked = presentAlert(stateMachine.acknowledge(alert).alert)

        const result = stateMachine.clearCondition(acked)

        expect(result.cleared).to.equal(true)
        expect(result.alert).to.be.null
      })
    })

    it('should be idempotent on already-cleared condition', () => {
      const alert = makeAlert({ priority: 'alarm' })
      const rtn = presentAlert(stateMachine.clearCondition(alert).alert)

      const result = stateMachine.clearCondition(rtn)

      expect(result.cleared).to.equal(false)
      expect(result.alert?.state).to.equal('rtn-unacknowledged')
    })
  })

  describe('silence', () => {
    it('should set silenced to true', () => {
      const alert = makeAlert()
      const until = new Date(Date.now() + 30000)

      const result = stateMachine.silence(alert, until)

      expect(result.silenced).to.equal(true)
    })

    it('should set silencedUntil timestamp', () => {
      const alert = makeAlert()
      const until = new Date(Date.now() + 30000)

      const result = stateMachine.silence(alert, until)

      expect(result.silencedUntil).to.equal(until.toISOString())
    })

    it('should not change alert state', () => {
      const alert = makeAlert()
      const until = new Date(Date.now() + 30000)

      const result = stateMachine.silence(alert, until)

      expect(result.state).to.equal(alert.state)
    })

    it('should work on acknowledged alerts', () => {
      const alert = makeAlert()
      const acked = presentAlert(stateMachine.acknowledge(alert).alert)
      const until = new Date(Date.now() + 30000)

      const result = stateMachine.silence(acked, until)

      expect(result.silenced).to.equal(true)
      expect(result.state).to.equal('acknowledged')
    })
  })

  describe('unsilence', () => {
    it('should set silenced to false', () => {
      const alert = makeAlert()
      const silenced = stateMachine.silence(alert, new Date(Date.now() + 30000))

      const result = stateMachine.unsilence(silenced)

      expect(result.silenced).to.equal(false)
    })

    it('should clear silencedUntil', () => {
      const alert = makeAlert()
      const silenced = stateMachine.silence(alert, new Date(Date.now() + 30000))

      const result = stateMachine.unsilence(silenced)

      expect(result.silencedUntil).to.be.undefined
    })

    it('should be idempotent on non-silenced alert', () => {
      const alert = makeAlert()

      const result = stateMachine.unsilence(alert)

      expect(result.silenced).to.equal(false)
    })
  })

  describe('requiresAcknowledgment', () => {
    it('should return true for emergency priority', () => {
      expect(AlertStateMachine.requiresAcknowledgment('emergency')).to.equal(
        true
      )
    })

    it('should return true for alarm priority', () => {
      expect(AlertStateMachine.requiresAcknowledgment('alarm')).to.equal(true)
    })

    it('should return true for warning priority', () => {
      expect(AlertStateMachine.requiresAcknowledgment('warning')).to.equal(true)
    })

    it('should return false for caution priority', () => {
      expect(AlertStateMachine.requiresAcknowledgment('caution')).to.equal(
        false
      )
    })
  })

  describe('isUnacknowledged', () => {
    it('should return true for unacknowledged state', () => {
      const alert = makeAlert()
      expect(AlertStateMachine.isUnacknowledged(alert)).to.equal(true)
    })

    it('should return true for rtn-unacknowledged state', () => {
      const alert = makeAlert()
      const rtn = presentAlert(stateMachine.clearCondition(alert).alert)
      expect(AlertStateMachine.isUnacknowledged(rtn)).to.equal(true)
    })

    it('should return false for acknowledged state', () => {
      const alert = makeAlert()
      const acked = presentAlert(stateMachine.acknowledge(alert).alert)
      expect(AlertStateMachine.isUnacknowledged(acked)).to.equal(false)
    })
  })

  describe('immutability', () => {
    it('should not mutate input alert on acknowledge', () => {
      const alert = makeAlert()
      const originalState = alert.state

      stateMachine.acknowledge(alert)

      expect(alert.state).to.equal(originalState)
    })

    it('should not mutate input alert on clearCondition', () => {
      const alert = makeAlert()
      const originalCondition = alert.condition

      stateMachine.clearCondition(alert)

      expect(alert.condition).to.equal(originalCondition)
    })

    it('should not mutate input alert on silence', () => {
      const alert = makeAlert()
      const originalSilenced = alert.silenced

      stateMachine.silence(alert, new Date(Date.now() + 30000))

      expect(alert.silenced).to.equal(originalSilenced)
    })

    it('should not mutate input alert on reactivate', () => {
      const alert = makeAlert()
      const acked = presentAlert(stateMachine.acknowledge(alert).alert)
      const originalState = acked.state

      stateMachine.reactivate(acked)

      expect(acked.state).to.equal(originalState)
    })
  })

  describe('reactivate', () => {
    const OLD = '2020-01-01T00:00:00.000Z'

    it('should transition acknowledged to unacknowledged', () => {
      const alert = makeAlert()
      const acked = presentAlert(
        stateMachine.acknowledge(alert, 'user-1').alert
      )

      const result = stateMachine.reactivate(acked)

      expect(result.cleared).to.equal(false)
      expect(result.previousState).to.equal('acknowledged')
      expect(result.alert?.state).to.equal('unacknowledged')
      expect(result.alert?.condition).to.equal(true)
    })

    it('should reset acknowledgedAt and acknowledgedBy on acknowledged → unacknowledged', () => {
      const alert = makeAlert()
      const acked = presentAlert(
        stateMachine.acknowledge(alert, 'user-1').alert
      )
      expect(acked.acknowledgedAt).to.not.be.undefined
      expect(acked.acknowledgedBy).to.equal('user-1')

      const result = stateMachine.reactivate(acked)

      expect(result.alert?.acknowledgedAt).to.be.undefined
      expect(result.alert?.acknowledgedBy).to.be.undefined
    })

    it('should transition rtn-unacknowledged to unacknowledged', () => {
      const alert = makeAlert()
      const rtn = presentAlert(stateMachine.clearCondition(alert).alert)
      expect(rtn.state).to.equal('rtn-unacknowledged')

      const result = stateMachine.reactivate(rtn)

      expect(result.cleared).to.equal(false)
      expect(result.previousState).to.equal('rtn-unacknowledged')
      expect(result.alert?.state).to.equal('unacknowledged')
      expect(result.alert?.condition).to.equal(true)
    })

    it('should reset clearedAt on rtn-unacknowledged → unacknowledged', () => {
      const alert = makeAlert()
      const rtn = presentAlert(stateMachine.clearCondition(alert).alert)
      expect(rtn.clearedAt).to.not.be.undefined

      const result = stateMachine.reactivate(rtn)

      expect(result.alert?.clearedAt).to.be.undefined
    })

    it('should be idempotent on unacknowledged alert', () => {
      const alert = makeAlert()

      const result = stateMachine.reactivate(alert)

      expect(result.cleared).to.equal(false)
      expect(result.previousState).to.equal('unacknowledged')
      expect(result.alert?.state).to.equal('unacknowledged')
      expect(result.alert?.condition).to.equal(true)
    })

    it('should preserve silencing on reactivation (AlertManager clears it)', () => {
      const alert = makeAlert()
      const acked = presentAlert(stateMachine.acknowledge(alert).alert)
      const silenced = stateMachine.silence(acked, new Date(Date.now() + 30000))

      const result = stateMachine.reactivate(silenced)

      // Silencing is NOT cleared by the state machine — that responsibility
      // belongs to AlertManager.clearSilencingIfSuperseded(), which also
      // manages the silence expiration timers.
      expect(result.alert?.silenced).to.equal(true)
      expect(result.alert?.silencedUntil).to.not.be.undefined
    })

    it('should transition latching acknowledged to unacknowledged', () => {
      const alert = makeAlert({ latching: true })
      const acked = presentAlert(
        stateMachine.acknowledge(alert, 'user-1').alert
      )

      const result = stateMachine.reactivate(acked)

      expect(result.cleared).to.equal(false)
      expect(result.previousState).to.equal('acknowledged')
      expect(result.alert?.state).to.equal('unacknowledged')
      expect(result.alert?.condition).to.equal(true)
      expect(result.alert?.latching).to.equal(true)
    })

    it('should reactivate a latched alert held with condition=false', () => {
      const alert = makeAlert({ latching: true })
      const cleared = presentAlert(stateMachine.clearCondition(alert).alert)
      expect(cleared.state).to.equal('unacknowledged')
      expect(cleared.condition).to.equal(false)

      const result = stateMachine.reactivate(cleared)

      expect(result.alert?.state).to.equal('unacknowledged')
      expect(result.alert?.condition).to.equal(true)
      expect(result.alert?.latching).to.equal(true)
    })

    it('should preserve raisedAt', () => {
      const alert = makeAlert()
      const originalRaisedAt = alert.raisedAt
      const acked = presentAlert(stateMachine.acknowledge(alert).alert)

      const result = stateMachine.reactivate(acked)

      expect(result.alert?.raisedAt).to.equal(originalRaisedAt)
    })

    it('should reset clearedAt and bump stateChangedAt when a latched condition returns', () => {
      const cleared = presentAlert(
        stateMachine.clearCondition(makeAlert({ latching: true })).alert
      )
      const latched: Alert = { ...cleared, stateChangedAt: OLD }
      expect(latched.state).to.equal('unacknowledged')
      expect(latched.condition).to.equal(false)
      expect(latched.clearedAt).to.be.a('string')
      const before = new Date().toISOString()

      const result = presentAlert(stateMachine.reactivate(latched).alert)

      // The condition coming back is a fresh annunciation
      expect(result.condition).to.equal(true)
      expect(result.clearedAt).to.be.undefined
      expect(result.stateChangedAt >= before).to.equal(true)
    })

    it('should keep stateChangedAt when the condition is already active', () => {
      const alert: Alert = { ...makeAlert(), stateChangedAt: OLD }

      const result = presentAlert(stateMachine.reactivate(alert).alert)

      expect(result.state).to.equal('unacknowledged')
      expect(result.condition).to.equal(true)
      expect(result.stateChangedAt).to.equal(OLD)
    })
  })

  describe('stateChangedAt tracking (IEC 62923-1 6.4.2.2)', () => {
    const OLD = '2020-01-01T00:00:00.000Z'

    it('sets stateChangedAt equal to raisedAt on creation', () => {
      const alert = makeAlert()
      expect(alert.stateChangedAt).to.equal(alert.raisedAt)
    })

    it('updates stateChangedAt when acknowledging', () => {
      const alert = { ...makeAlert(), stateChangedAt: OLD }
      const before = new Date().toISOString()
      const result = presentAlert(stateMachine.acknowledge(alert).alert)

      expect(result.state).to.equal('acknowledged')
      expect(result.stateChangedAt >= before).to.equal(true)
    })

    it('updates stateChangedAt when the condition clears to rtn-unacknowledged', () => {
      const alert = { ...makeAlert({ priority: 'alarm' }), stateChangedAt: OLD }
      const before = new Date().toISOString()
      const result = presentAlert(stateMachine.clearCondition(alert).alert)

      expect(result.state).to.equal('rtn-unacknowledged')
      expect(result.stateChangedAt >= before).to.equal(true)
    })

    it('does not change stateChangedAt when a latching alert keeps its state', () => {
      const alert = {
        ...makeAlert({ priority: 'alarm', latching: true }),
        stateChangedAt: OLD
      }
      const result = presentAlert(stateMachine.clearCondition(alert).alert)

      // Latched: stays unacknowledged, only the condition flag flips
      expect(result.state).to.equal('unacknowledged')
      expect(result.condition).to.equal(false)
      expect(result.stateChangedAt).to.equal(OLD)
    })

    it('updates stateChangedAt when reactivating an acknowledged alert', () => {
      const acked = {
        ...presentAlert(stateMachine.acknowledge(makeAlert()).alert),
        stateChangedAt: OLD
      }
      const before = new Date().toISOString()
      const result = presentAlert(stateMachine.reactivate(acked).alert)

      expect(result.state).to.equal('unacknowledged')
      expect(result.stateChangedAt >= before).to.equal(true)
    })

    it('updates stateChangedAt when reactivating an rtn-unacknowledged alert', () => {
      const rtn = {
        ...makeAlert({ priority: 'alarm' }),
        state: 'rtn-unacknowledged' as const,
        condition: false,
        stateChangedAt: OLD
      }
      const before = new Date().toISOString()
      const result = presentAlert(stateMachine.reactivate(rtn).alert)

      expect(result.state).to.equal('unacknowledged')
      expect(result.stateChangedAt >= before).to.equal(true)
    })

    it('does not change stateChangedAt when silencing', () => {
      const alert = { ...makeAlert(), stateChangedAt: OLD }
      const result = stateMachine.silence(alert, new Date(Date.now() + 60000))

      expect(result.silenced).to.equal(true)
      expect(result.stateChangedAt).to.equal(OLD)
    })

    it('does not change stateChangedAt when unsilencing', () => {
      const alert = { ...makeAlert(), silenced: true, stateChangedAt: OLD }
      const result = stateMachine.unsilence(alert)

      expect(result.silenced).to.equal(false)
      expect(result.stateChangedAt).to.equal(OLD)
    })
  })
})
