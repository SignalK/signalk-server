import { expect } from 'chai'
import { getAvailableCategories, getCategories } from '../../dist/categories.js'

describe('appstore/categories', () => {
  it('maps the plotter extensions keyword to its category', () => {
    const categories = getCategories({
      name: 'signalk-example-extension',
      version: '1.0.0',
      date: '2026-10-01T00:00:00.000Z',
      keywords: [
        'signalk-node-server-plugin',
        'signalk-category-plotter-extensions',
        'signalk-category-chart-plotters'
      ]
    })
    expect(categories).to.deep.equal(['Plotter Extensions', 'Chart Plotters'])
  })

  it('offers Plotter Extensions as a filter category', () => {
    expect(getAvailableCategories()).to.include('Plotter Extensions')
  })
})
