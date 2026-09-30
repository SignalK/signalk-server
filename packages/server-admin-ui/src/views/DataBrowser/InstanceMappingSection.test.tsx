import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { render, screen, fireEvent, act, within } from '@testing-library/react'
import InstanceMappingSection from './InstanceMappingSection'
import type {
  DiscoveredInstance,
  InstanceScan,
  TargetEditor
} from './n2kInstances'
import { useStore, type N2kInstanceRule } from '../../store'
import type { N2kDeviceEntry } from '../../utils/sourceLabels'

// Manufacturer code 137, unique number 656598 in the NAME's low word.
const DEVICE_KEY = '137:656598'
const CAN_NAME =
  'c0788c00' + (((137 << 21) | 656598) >>> 0).toString(16).padStart(8, '0')

const DEVICE: N2kDeviceEntry = {
  sourceRef: `can0.${CAN_NAME}`,
  connection: 'can0',
  srcAddr: '50',
  src: '50',
  canName: CAN_NAME,
  pgns: { '127488': 'Engine Parameters, Rapid Update' }
}

function engine(instance: number, unmapped: string): DiscoveredInstance[] {
  const editor: TargetEditor = {
    kind: 'branch',
    branches: ['propulsion', 'generator'],
    unmapped: [unmapped]
  }
  return [127488, 127489].map((pgn) => ({
    pgn,
    instance,
    sourceLabel: '',
    group: 'engine',
    editor
  }))
}

const ENGINE_0 = engine(0, 'propulsion.port')
const ENGINE_1 = engine(1, 'propulsion.starboard')

const BATTERIES: DiscoveredInstance[] = [0, 1].map((instance) => ({
  pgn: 127508,
  instance,
  sourceLabel: '',
  group: 'battery',
  editor: {
    kind: 'fixed',
    root: 'electrical.batteries',
    unmapped: [`electrical.batteries.${instance}`]
  }
}))

const ENGINE_ROOM = 'environment.inside.engineRoom.temperature'
const ENGINE_ROOM_TEMPERATURE: DiscoveredInstance = {
  pgn: 130312,
  instance: 1,
  sourceLabel: 'Engine Room Temperature',
  sourceEnum: 3,
  group: 'temperature',
  discriminator: 3,
  editor: {
    kind: 'location',
    locations: [
      'environment.outside.temperature',
      'environment.inside.<zone>.temperature',
      ENGINE_ROOM,
      'propulsion.<id>.exhaustTemperature'
    ],
    unmapped: [ENGINE_ROOM]
  }
}

function temperature(
  discriminator: number,
  sourceLabel: string,
  unmapped: string
): DiscoveredInstance {
  return {
    pgn: 130312,
    instance: 0,
    sourceLabel,
    sourceEnum: discriminator,
    group: 'temperature',
    discriminator,
    editor: {
      kind: 'location',
      locations: [
        'environment.outside.temperature',
        'environment.inside.<zone>.temperature'
      ],
      unmapped: [unmapped]
    }
  }
}

const MAIN_CABIN = 'environment.inside.mainCabin.temperature'
const INSIDE_TEMPERATURE = temperature(
  2,
  'Inside Temperature',
  'environment.inside.temperature'
)
const MAIN_CABIN_TEMPERATURE = temperature(
  4,
  'Main Cabin Temperature',
  MAIN_CABIN
)
const INSIDE_ALTERNATES =
  'Temperature · Main Cabin Temperature · instance 0 also writes this path; their values will alternate.'

const DC_CONNECTION: DiscoveredInstance = {
  pgn: 127751,
  instance: 0,
  sourceLabel: '',
  group: 'dcConnection',
  editor: {
    kind: 'branch',
    branches: [
      'electrical.solar',
      'electrical.alternators',
      'electrical.batteries'
    ],
    other: true,
    unmapped: ['electrical.dc.50.0']
  }
}

const USER_DEFINED_TEMPERATURE_PATH =
  'generic.temperatures.userDefined130.0.temperature'
const USER_DEFINED_TEMPERATURE: DiscoveredInstance = {
  pgn: 130312,
  instance: 0,
  sourceLabel: '',
  sourceEnum: 130,
  group: 'temperature',
  discriminator: 130,
  editor: {
    kind: 'location',
    locations: [
      'environment.outside.temperature',
      'environment.inside.<zone>.temperature'
    ],
    other: true,
    unmapped: [USER_DEFINED_TEMPERATURE_PATH]
  }
}
const USER_DEFINED_ROW = 'Temperature Code 130 instance 0'
const WET_EXHAUST = 'propulsion.main.wetExhaustTemperature'

const HYDRAULIC_PRESSURE: DiscoveredInstance = {
  pgn: 130314,
  instance: 0,
  sourceLabel: '',
  group: 'pressure',
  discriminator: 4,
  editor: { kind: 'free', unmapped: ['hydraulic.0.pressure'] }
}

interface FetchCall {
  url: string
  init?: RequestInit
}

interface ServerStub {
  stored?: N2kInstanceRule[]
  getStatus?: number
  putStatus?: number
  putBody?: unknown
}

function stubServer({
  stored = [],
  getStatus = 200,
  putStatus = 200,
  putBody = { state: 'COMPLETED', statusCode: 200 }
}: ServerStub = {}): FetchCall[] {
  const calls: FetchCall[] = []
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string, init?: RequestInit) => {
      calls.push({ url, init })
      const status = init?.method === 'PUT' ? putStatus : getStatus
      return {
        ok: status >= 200 && status < 300,
        status,
        json: async () => (init?.method === 'PUT' ? putBody : stored)
      }
    })
  )
  return calls
}

function scanOf(instances: DiscoveredInstance[]): InstanceScan {
  return { instances, loading: false, error: null, rescan: vi.fn() }
}

function renderSection(
  instances: DiscoveredInstance[],
  device: N2kDeviceEntry = DEVICE
) {
  return render(
    <InstanceMappingSection device={device} scan={scanOf(instances)} />
  )
}

function puts(calls: FetchCall[]) {
  return calls
    .filter((call) => call.init?.method === 'PUT')
    .map((call) => ({
      url: call.url,
      body: JSON.parse(String(call.init?.body)) as unknown
    }))
}

async function save() {
  await act(async () => {
    fireEvent.click(screen.getByRole('button', { name: 'Save' }))
  })
}

function edit(label: string, value: string) {
  fireEvent.change(screen.getByLabelText(label), { target: { value } })
}

function saveButton() {
  return screen.getByRole('button', { name: 'Save' })
}

function optionLabels(label: string): string[] {
  return within(screen.getByLabelText(label))
    .getAllByRole('option')
    .map((option) => option.textContent ?? '')
}

describe('InstanceMappingSection', () => {
  beforeEach(() => {
    useStore.setState({ n2kInstanceMappings: {}, loginStatus: {} })
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('saves a battery id under its fixed root', async () => {
    const calls = stubServer()
    renderSection(BATTERIES)
    const id = await screen.findByLabelText('Id for Battery instance 0')
    expect(id).toHaveValue('0')
    expect(screen.queryByRole('combobox')).toBeNull()
    expect(screen.getAllByText('electrical.batteries.')).toHaveLength(2)
    expect(saveButton()).toBeDisabled()

    edit('Id for Battery instance 0', 'house')
    expect(screen.queryByText(/^e\.g\./)).toBeNull()
    expect(id.closest('tr')).toHaveStyle({
      backgroundColor: 'var(--bs-warning-bg-subtle, #fff3cd)'
    })
    await save()

    expect(puts(calls)).toEqual([
      {
        url: expect.stringMatching(/\/n2kInstanceMappings\/137%3A656598$/),
        body: [
          {
            group: 'battery',
            instance: 0,
            target: 'electrical.batteries.house'
          }
        ]
      }
    ])
    expect(screen.getByText('Paths saved')).toBeTruthy()
    expect(useStore.getState().n2kInstanceMappings[DEVICE_KEY]).toEqual([
      { group: 'battery', instance: 0, target: 'electrical.batteries.house' }
    ])
  })

  it('stores nothing when the n2k-signalk id is typed back', async () => {
    const calls = stubServer({
      stored: [
        { group: 'battery', instance: 0, target: 'electrical.batteries.house' }
      ]
    })
    renderSection(BATTERIES)
    expect(
      await screen.findByLabelText('Id for Battery instance 0')
    ).toHaveValue('house')

    edit('Id for Battery instance 0', '0')
    await save()

    expect(puts(calls)[0].body).toEqual([])
  })

  it('saves an engine moved to the generator branch', async () => {
    const calls = stubServer()
    renderSection(ENGINE_1)
    const path = 'Path for Engine instance 1'
    expect(await screen.findByLabelText(path)).toHaveValue('propulsion.<id>')
    expect(optionLabels(path)).toEqual(['propulsion', 'generator'])
    expect(screen.getByLabelText('Id for Engine instance 1')).toHaveValue(
      'starboard'
    )
    // The two engine PGNs collapse into one row.
    expect(screen.getAllByRole('combobox')).toHaveLength(1)

    edit(path, 'generator.<id>')
    edit('Id for Engine instance 1', 'genset')
    expect(screen.queryByText(/^e\.g\./)).toBeNull()
    await save()

    expect(puts(calls)[0].body).toEqual([
      { group: 'engine', instance: 1, target: 'generator.genset' }
    ])
  })

  it('shows a stored engine rule as its branch and id', async () => {
    stubServer({
      stored: [{ group: 'engine', instance: 0, target: 'propulsion.main' }]
    })
    renderSection(ENGINE_0)

    expect(
      await screen.findByLabelText('Path for Engine instance 0')
    ).toHaveValue('propulsion.<id>')
    expect(screen.getByLabelText('Id for Engine instance 0')).toHaveValue(
      'main'
    )
    expect(saveButton()).toBeDisabled()
  })

  it('saves a temperature zone location as its full leaf path', async () => {
    const calls = stubServer()
    renderSection([ENGINE_ROOM_TEMPERATURE])
    const path = 'Path for Temperature Engine Room Temperature instance 1'
    expect(await screen.findByLabelText(path)).toHaveValue(ENGINE_ROOM)
    expect(optionLabels(path)).toHaveLength(4)

    edit(path, 'environment.inside.<zone>.temperature')
    expect(screen.getByText('environment.inside.')).toBeTruthy()
    expect(screen.getByText('.temperature')).toBeTruthy()
    edit('Zone for Temperature Engine Room Temperature instance 1', 'saloon')
    expect(
      screen.queryByText('environment.inside.saloon.temperature')
    ).toBeNull()
    await save()

    expect(puts(calls)[0].body).toEqual([
      {
        group: 'temperature',
        discriminator: 3,
        instance: 1,
        target: 'environment.inside.saloon.temperature'
      }
    ])
  })

  it('warns without blocking Save when another row writes the target', async () => {
    const calls = stubServer()
    renderSection([INSIDE_TEMPERATURE, MAIN_CABIN_TEMPERATURE])
    const path = 'Path for Temperature Inside Temperature instance 0'
    await screen.findByLabelText(path)
    edit(path, 'environment.inside.<zone>.temperature')
    edit('Zone for Temperature Inside Temperature instance 0', 'mainCabin')

    expect(screen.getByText(INSIDE_ALTERNATES)).toBeTruthy()
    expect(saveButton()).toBeEnabled()
    await save()
    expect(puts(calls)[0].body).toEqual([
      {
        group: 'temperature',
        discriminator: 2,
        instance: 0,
        target: MAIN_CABIN
      }
    ])
  })

  it('does not warn when the other row is moved away from the target', async () => {
    stubServer({
      stored: [
        {
          group: 'temperature',
          discriminator: 4,
          instance: 0,
          target: 'environment.inside.saloon.temperature'
        }
      ]
    })
    renderSection([INSIDE_TEMPERATURE, MAIN_CABIN_TEMPERATURE])
    const path = 'Path for Temperature Inside Temperature instance 0'
    await screen.findByLabelText(path)
    edit(path, 'environment.inside.<zone>.temperature')
    edit('Zone for Temperature Inside Temperature instance 0', 'mainCabin')

    expect(screen.queryByText(/their values will alternate/)).toBeNull()
    expect(saveButton()).toBeEnabled()
  })

  it('shows a path outside the choices as text with an empty editor', async () => {
    stubServer()
    renderSection([DC_CONNECTION])
    const path = 'Path for DC connection instance 0'
    expect(await screen.findByLabelText(path)).toHaveValue('')
    expect(optionLabels(path)).toEqual([
      'Choose…',
      'electrical.solar',
      'electrical.alternators',
      'electrical.batteries',
      'Other path…'
    ])
    expect(screen.getByText('Current path: electrical.dc.50.0')).toBeTruthy()
    expect(
      screen.queryByLabelText('Id for DC connection instance 0')
    ).toBeNull()
    expect(screen.getByLabelText(path).closest('tr')).not.toHaveStyle({
      backgroundColor: 'var(--bs-warning-bg-subtle, #fff3cd)'
    })
    expect(saveButton()).toBeDisabled()
    expect(screen.queryByRole('button', { name: /^Reset/ })).toBeNull()
  })

  it('shows a dew point row at its current path with an empty editor', async () => {
    const calls = stubServer()
    const dewPoint: DiscoveredInstance = {
      ...ENGINE_ROOM_TEMPERATURE,
      instance: 0,
      sourceLabel: 'Dew Point Temperature',
      sourceEnum: 9,
      discriminator: 9,
      editor: {
        ...ENGINE_ROOM_TEMPERATURE.editor!,
        unmapped: ['environment.outside.dewPointTemperature']
      }
    }
    renderSection([dewPoint])
    const path = 'Path for Temperature Dew Point Temperature instance 0'
    expect(await screen.findByLabelText(path)).toHaveValue('')
    expect(
      screen.getByText('Current path: environment.outside.dewPointTemperature')
    ).toBeTruthy()
    expect(screen.queryByRole('button', { name: /^Reset/ })).toBeNull()

    edit(path, 'environment.outside.temperature')
    const editor = screen.getByRole('group', {
      name: 'Path editor for Temperature Dew Point Temperature instance 0'
    })
    expect(
      within(editor).getByRole('button', { name: /^Reset/ })
    ).toHaveAttribute(
      'title',
      'Reset to environment.outside.dewPointTemperature'
    )
    await save()
    expect(puts(calls)[0].body).toEqual([
      {
        group: 'temperature',
        discriminator: 9,
        instance: 0,
        target: 'environment.outside.temperature'
      }
    ])
  })

  it('resets an edited row to the n2k-signalk path', async () => {
    const calls = stubServer()
    renderSection(BATTERIES)
    await screen.findByLabelText('Id for Battery instance 0')
    expect(screen.queryByRole('button', { name: /^Reset/ })).toBeNull()

    edit('Id for Battery instance 0', 'house')
    const editor = screen.getByRole('group', {
      name: 'Path editor for Battery instance 0'
    })
    expect(
      within(editor).getByLabelText('Id for Battery instance 0')
    ).toBeTruthy()
    const reset = within(editor).getByRole('button', {
      name: 'Reset path for Battery instance 0'
    })
    expect(reset).toHaveAttribute('title', 'Reset to electrical.batteries.0')
    fireEvent.click(reset)
    expect(screen.getByLabelText('Id for Battery instance 0')).toHaveValue('0')
    expect(screen.queryByRole('button', { name: /^Reset/ })).toBeNull()

    edit('Id for Battery instance 1', 'start')
    await save()
    expect(puts(calls)[0].body).toEqual([
      { group: 'battery', instance: 1, target: 'electrical.batteries.start' }
    ])
  })

  it('resets a stored path to an n2k-signalk path outside the choices', async () => {
    const calls = stubServer({
      stored: [
        { group: 'engine', instance: 0, target: 'propulsion.main' },
        { group: 'dcConnection', instance: 0, target: 'electrical.solar.roof' }
      ]
    })
    renderSection([...ENGINE_0, DC_CONNECTION])
    const path = 'Path for DC connection instance 0'
    expect(await screen.findByLabelText(path)).toHaveValue(
      'electrical.solar.<id>'
    )
    expect(screen.queryByText(/Current path/)).toBeNull()
    const editor = screen.getByRole('group', {
      name: 'Path editor for DC connection instance 0'
    })
    expect(within(editor).getByLabelText(path)).toBeTruthy()

    fireEvent.click(
      within(editor).getByRole('button', {
        name: 'Reset path for DC connection instance 0'
      })
    )
    expect(screen.getByLabelText(path)).toHaveValue('')
    expect(screen.getByText('Current path: electrical.dc.50.0')).toBeTruthy()
    expect(
      screen.queryByRole('button', {
        name: 'Reset path for DC connection instance 0'
      })
    ).toBeNull()
    await save()

    expect(puts(calls)[0].body).toEqual([
      { group: 'engine', instance: 0, target: 'propulsion.main' }
    ])
  })

  it('warns on both rows of two untouched sensors sharing a path', async () => {
    stubServer()
    const second = { ...ENGINE_ROOM_TEMPERATURE, instance: 0 }
    renderSection([second, ENGINE_ROOM_TEMPERATURE])
    const path = 'Path for Temperature Engine Room Temperature instance 0'
    await screen.findByLabelText(path)

    for (const other of ['1', '0']) {
      expect(
        screen.getByText(
          `Temperature · Engine Room Temperature · instance ${other} also writes this path; their values will alternate.`
        )
      ).toBeTruthy()
    }
    expect(saveButton()).toBeDisabled()

    edit(path, 'environment.inside.<zone>.temperature')
    edit('Zone for Temperature Engine Room Temperature instance 0', 'saloon')
    expect(screen.queryByText(/their values will alternate/)).toBeNull()
  })

  it('saves an other path for a temperature source without a spec leaf', async () => {
    const calls = stubServer()
    renderSection([USER_DEFINED_TEMPERATURE])
    const path = `Path for ${USER_DEFINED_ROW}`
    expect(await screen.findByLabelText(path)).toHaveValue('')
    expect(
      screen.getByText(`Current path: ${USER_DEFINED_TEMPERATURE_PATH}`)
    ).toBeTruthy()
    expect(
      screen.queryByLabelText(`Other path for ${USER_DEFINED_ROW}`)
    ).toBeNull()
    expect(saveButton()).toBeDisabled()

    edit(path, '<path>')
    expect(
      screen.getByLabelText(`Other path for ${USER_DEFINED_ROW}`)
    ).toHaveValue('')
    edit(`Other path for ${USER_DEFINED_ROW}`, 'notifications.wet.exhaust')
    expect(screen.getByText('Use a path outside notifications')).toBeTruthy()
    expect(saveButton()).toBeDisabled()
    edit(`Other path for ${USER_DEFINED_ROW}`, WET_EXHAUST)
    await save()

    expect(puts(calls)[0].body).toEqual([
      {
        group: 'temperature',
        discriminator: 130,
        instance: 0,
        target: WET_EXHAUST
      }
    ])
  })

  it('shows a stored other path with Other path selected', async () => {
    stubServer({
      stored: [
        {
          group: 'temperature',
          discriminator: 130,
          instance: 0,
          target: WET_EXHAUST
        }
      ]
    })
    renderSection([USER_DEFINED_TEMPERATURE])
    const path = `Path for ${USER_DEFINED_ROW}`
    expect(await screen.findByLabelText(path)).toHaveValue('<path>')
    expect(
      screen.getByLabelText(`Other path for ${USER_DEFINED_ROW}`)
    ).toHaveValue(WET_EXHAUST)
    expect(screen.queryByText(/^Current path/)).toBeNull()
    expect(saveButton()).toBeDisabled()
    expect(
      screen.getByRole('button', { name: `Reset path for ${USER_DEFINED_ROW}` })
    ).toBeTruthy()
  })

  it('offers no other path where the spec has a leaf', async () => {
    stubServer()
    renderSection([ENGINE_ROOM_TEMPERATURE])
    const path = 'Path for Temperature Engine Room Temperature instance 1'
    await screen.findByLabelText(path)
    expect(optionLabels(path)).not.toContain('Other path…')
  })

  it('edits a pressure source without a spec location as a free path', async () => {
    const calls = stubServer()
    renderSection([HYDRAULIC_PRESSURE])
    const path = 'Path for Pressure Hydraulic instance 0'
    expect(await screen.findByLabelText(path)).toHaveValue(
      'hydraulic.0.pressure'
    )
    expect(screen.queryByRole('combobox')).toBeNull()

    edit(path, 'steering.hydraulic.pressure')
    await save()

    expect(puts(calls)[0].body).toEqual([
      {
        group: 'pressure',
        discriminator: 4,
        instance: 0,
        target: 'steering.hydraulic.pressure'
      }
    ])
  })

  it('holds a free path to the server target grammar', async () => {
    stubServer()
    renderSection([HYDRAULIC_PRESSURE])
    const path = 'Path for Pressure Hydraulic instance 0'
    await screen.findByLabelText(path)

    for (const [target, message] of [
      ['notifications.hydraulic.pressure', 'Use a path outside notifications'],
      ['a.b.c.d.e.f.g.h.i', 'Use at most 8 segments'],
      [`a.${'b'.repeat(128)}`, 'Use at most 128 characters'],
      ['hydraulic.constructor.pressure', 'constructor is not allowed in a path']
    ]) {
      edit(path, target)
      expect(screen.getByText(message), target).toBeTruthy()
      expect(saveButton()).toBeDisabled()
    }

    edit(path, 'steering.hydraulic.pressure')
    expect(saveButton()).toBeEnabled()
  })

  it('shows a row error for an invalid id and keeps Save disabled', async () => {
    stubServer()
    renderSection(BATTERIES)
    await screen.findByLabelText('Id for Battery instance 0')

    edit('Id for Battery instance 0', 'house.aft')
    expect(screen.getByText('Use letters and digits only')).toBeTruthy()
    expect(screen.getByLabelText('Id for Battery instance 0')).toHaveAttribute(
      'aria-invalid',
      'true'
    )
    expect(saveButton()).toBeDisabled()

    edit('Id for Battery instance 0', '')
    expect(saveButton()).toBeDisabled()

    edit('Id for Battery instance 0', 'house')
    expect(saveButton()).toBeEnabled()
  })

  it('shows an absent engine instance as absent', async () => {
    stubServer()
    renderSection(engine(255, 'propulsion.starboard'))

    expect(await screen.findByText('absent')).toBeTruthy()
    expect(
      screen.getByLabelText('Path for Engine instance absent')
    ).toBeTruthy()
  })

  it('lists a stored rule that was not observed and deletes it', async () => {
    const calls = stubServer({
      stored: [
        { group: 'battery', instance: 3, target: 'electrical.batteries.house' }
      ]
    })
    renderSection([])
    expect(await screen.findByText('not currently observed')).toBeTruthy()
    expect(screen.getByText('electrical.batteries.house')).toBeTruthy()

    fireEvent.click(
      screen.getByRole('button', { name: 'Delete path for Battery instance 3' })
    )
    expect(screen.getByText(/Removed on save/)).toBeTruthy()
    await save()

    expect(puts(calls)[0].body).toEqual([])
  })

  it('discards the edits', async () => {
    stubServer()
    renderSection(BATTERIES)
    await screen.findByLabelText('Id for Battery instance 0')
    edit('Id for Battery instance 0', 'house')

    fireEvent.click(screen.getByRole('button', { name: 'Discard' }))

    expect(screen.getByLabelText('Id for Battery instance 0')).toHaveValue('0')
    expect(saveButton()).toBeDisabled()
  })

  it('describes rows by their path alone', async () => {
    stubServer({
      stored: [
        { group: 'engine', instance: 0, target: 'propulsion.main' },
        { group: 'battery', instance: 7, target: 'electrical.batteries.spare' }
      ]
    })
    const { container } = renderSection([
      ...ENGINE_0,
      ...BATTERIES,
      ENGINE_ROOM_TEMPERATURE,
      DC_CONNECTION,
      HYDRAULIC_PRESSURE
    ])
    await screen.findByLabelText('Path for Engine instance 0')
    edit('Id for Battery instance 0', 'house')

    const text = container.textContent ?? ''
    for (const word of [
      /default/i,
      /unmapped/i,
      /\bmapp(ed|ing)\b/i,
      /rule/i
    ]) {
      expect(text).not.toMatch(word)
    }
  })

  it('shows a server rejection inline and keeps the edits', async () => {
    stubServer({
      putStatus: 400,
      putBody: {
        state: 'FAILED',
        statusCode: 400,
        message: 'rules[0]: target generator.genset overlaps something'
      }
    })
    renderSection(ENGINE_0)
    await screen.findByLabelText('Path for Engine instance 0')

    edit('Path for Engine instance 0', 'generator.<id>')
    edit('Id for Engine instance 0', 'genset')
    await save()

    expect(screen.getByRole('alert').textContent).toBe(
      'rules[0]: target generator.genset overlaps something'
    )
    expect(screen.getByLabelText('Id for Engine instance 0')).toHaveValue(
      'genset'
    )
    expect(saveButton()).toBeEnabled()
    expect(useStore.getState().n2kInstanceMappings[DEVICE_KEY]).toEqual([])
  })

  it('shows the unavailable notice and no editor without a canName', () => {
    const calls = stubServer()
    renderSection(ENGINE_0, { ...DEVICE, canName: undefined })

    expect(
      screen.getByText(
        "Paths can be set once the device's address claim is received."
      )
    ).toBeTruthy()
    expect(screen.queryByRole('combobox')).toBeNull()
    expect(calls).toHaveLength(0)
  })

  it('follows a mappings event while it has no edits', async () => {
    stubServer()
    renderSection(BATTERIES)
    const id = await screen.findByLabelText('Id for Battery instance 0')
    expect(id).toHaveValue('0')

    act(() =>
      useStore.getState().setN2kInstanceMappings({
        [DEVICE_KEY]: [
          {
            group: 'battery',
            instance: 0,
            target: 'electrical.batteries.house'
          }
        ]
      })
    )
    expect(screen.getByLabelText('Id for Battery instance 0')).toHaveValue(
      'house'
    )

    // A device the event omits has no rules left.
    act(() => useStore.getState().setN2kInstanceMappings({}))
    expect(screen.getByLabelText('Id for Battery instance 0')).toHaveValue('0')
    expect(saveButton()).toBeDisabled()
  })

  it('keeps an edit when a mappings event arrives', async () => {
    stubServer()
    renderSection(BATTERIES)
    await screen.findByLabelText('Id for Battery instance 0')
    edit('Id for Battery instance 0', 'house')

    act(() =>
      useStore.getState().setN2kInstanceMappings({
        [DEVICE_KEY]: [
          {
            group: 'battery',
            instance: 0,
            target: 'electrical.batteries.start'
          }
        ]
      })
    )

    expect(screen.getByLabelText('Id for Battery instance 0')).toHaveValue(
      'house'
    )
  })

  it('is hidden from a user who is not an admin', () => {
    const calls = stubServer()
    useStore.setState({
      loginStatus: { authenticationRequired: true, userLevel: 'readonly' }
    })
    const { container } = renderSection(ENGINE_0)

    expect(container.firstChild).toBeNull()
    expect(calls).toHaveLength(0)
  })

  it('is hidden when the server refuses the mappings', async () => {
    const calls = stubServer({ getStatus: 401 })
    const { container } = renderSection(ENGINE_0)

    await act(async () => {})
    expect(calls).toHaveLength(1)
    expect(container.firstChild).toBeNull()
  })
})
