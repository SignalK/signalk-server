import { expect } from 'chai'

import { getFlag, parseMmsi } from './mmsi'

describe('MMSI parser', () => {
  it('Ship MMSI', (done) => {
    const r = parseMmsi('201456789')
    expect(r).to.be.an('object').to.have.property('mid').to.equal(201)
    expect(r).to.be.an('object').to.have.property('msi').to.equal(456789)
    expect(r).to.be.an('object').to.have.property('type').to.equal('ship')
    expect(r).to.be.an('object').to.have.property('flag').to.equal('AL')
    done()
  })

  it('Ship MMSI (no flag)', (done) => {
    const r = parseMmsi('299456789')
    expect(r).to.be.an('object').to.have.property('mid').to.equal(299)
    expect(r).to.be.an('object').to.have.property('msi').to.equal(456789)
    expect(r).to.be.an('object').to.have.property('type').to.equal('ship')
    expect(r).to.be.an('object').to.not.have.property('flag')
    done()
  })

  it('Coastal Station MMSI', (done) => {
    const r = parseMmsi('002014567')
    expect(r).to.be.an('object').to.have.property('mid').to.equal(201)
    expect(r).to.be.an('object').to.have.property('msi').to.equal(4567)
    expect(r)
      .to.be.an('object')
      .to.have.property('type')
      .to.equal('coastalStation')
    expect(r).to.be.an('object').to.have.property('flag').to.equal('AL')
    done()
  })

  it('Group MMSI', (done) => {
    const r = parseMmsi('020145678')
    expect(r).to.be.an('object').to.have.property('mid').to.equal(201)
    expect(r).to.be.an('object').to.have.property('msi').to.equal(45678)
    expect(r).to.be.an('object').to.have.property('type').to.equal('group')
    expect(r).to.be.an('object').to.have.property('flag').to.equal('AL')
    done()
  })

  it('AtoN MMSI', (done) => {
    const r = parseMmsi('992014567')
    expect(r).to.be.an('object').to.have.property('mid').to.equal(201)
    expect(r).to.be.an('object').to.have.property('msi').to.equal(4567)
    expect(r).to.be.an('object').to.have.property('type').to.equal('aton')
    expect(r).to.be.an('object').to.have.property('flag').to.equal('AL')
    done()
  })

  it('Auxiliary Craft MMSI', (done) => {
    const r = parseMmsi('982014567')
    expect(r).to.be.an('object').to.have.property('mid').to.equal(201)
    expect(r).to.be.an('object').to.have.property('msi').to.equal(4567)
    expect(r)
      .to.be.an('object')
      .to.have.property('type')
      .to.equal('auxiliaryCraft')
    expect(r).to.be.an('object').to.have.property('flag').to.equal('AL')
    done()
  })

  it('SART MMSI', (done) => {
    const r = parseMmsi('970201456')
    expect(r).to.be.an('object').to.have.property('mid').to.equal(201)
    expect(r).to.be.an('object').to.have.property('msi').to.equal(456)
    expect(r).to.be.an('object').to.have.property('type').to.equal('sart')
    expect(r).to.be.an('object').to.have.property('flag').to.equal('AL')
    done()
  })

  it('MOB Device MMSI', (done) => {
    const r = parseMmsi('972201456')
    expect(r).to.be.an('object').to.have.property('mid').to.equal(201)
    expect(r).to.be.an('object').to.have.property('msi').to.equal(456)
    expect(r).to.be.an('object').to.have.property('type').to.equal('mobDevice')
    expect(r).to.be.an('object').to.have.property('flag').to.equal('AL')
    done()
  })

  it('EPIRB MMSI', (done) => {
    const r = parseMmsi('974201456')
    expect(r).to.be.an('object').to.have.property('mid').to.equal(201)
    expect(r).to.be.an('object').to.have.property('msi').to.equal(456)
    expect(r).to.be.an('object').to.have.property('type').to.equal('epirb')
    expect(r).to.be.an('object').to.have.property('flag').to.equal('AL')
    done()
  })

  it('Diver Radio MMSI', (done) => {
    const r = parseMmsi('820145678')
    expect(r).to.be.an('object').to.have.property('mid').to.equal(201)
    expect(r).to.be.an('object').to.have.property('msi').to.equal(45678)
    expect(r).to.be.an('object').to.have.property('type').to.equal('diverRadio')
    expect(r).to.be.an('object').to.have.property('flag').to.equal('AL')
    done()
  })

  it('SaR Aircraft MMSI', (done) => {
    const r = parseMmsi('111201456')
    expect(r).to.be.an('object').to.have.property('mid').to.equal(201)
    expect(r).to.be.an('object').to.have.property('msi').to.equal(456)
    expect(r)
      .to.be.an('object')
      .to.have.property('type')
      .to.equal('sarAircraft')
    expect(r).to.be.an('object').to.have.property('flag').to.equal('AL')
    done()
  })

  it('Get Flag', (done) => {
    const r = getFlag('201456789')
    expect(r).to.be.equal('AL')
    done()
  })

  it('Invalid Flag', (done) => {
    const r = getFlag('299456789')
    expect(r).to.be.equal(null)
    done()
  })
})
