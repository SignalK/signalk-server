import { describe, it, expect, vi } from 'vitest'
import { render } from '@testing-library/react'
import MetaDataPage from './MetaDataPage'
import { useStore } from '../../store'

vi.mock('./useSignalKData', () => ({
  useSignalKData: () => ({
    context: 'self',
    setContext: () => {},
    contextOptions: [],
    search: '',
    setSearch: () => {},
    dataVersion: 0
  })
}))
vi.mock('./VirtualizedMetaTable', () => ({ default: () => null }))

describe('MetaDataPage', () => {
  it('loads the unit preferences that zones and display units need', () => {
    const fetchUnitPreferences = vi.fn(async () => {})
    useStore.setState({ unitPrefsLoaded: false, fetchUnitPreferences })
    render(<MetaDataPage />)
    expect(fetchUnitPreferences).toHaveBeenCalledOnce()
  })
})
