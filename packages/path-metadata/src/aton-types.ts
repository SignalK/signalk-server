/** AIS AtoN (Aid to Navigation) type ID to human-readable name. */
const ATON_TYPES: ReadonlyArray<{ id: number; name: string }> = [
  { id: 1, name: 'Reference Point' },
  { id: 2, name: 'RACON' },
  { id: 3, name: 'Fixed Structure Off Shore' },
  { id: 4, name: 'Emergency Wreck Marking Buoy' },
  { id: 5, name: 'Light, Without Sectors' },
  { id: 6, name: 'Light, With Sectors' },
  { id: 7, name: 'Leading Light Front' },
  { id: 8, name: 'Leading Light Rear' },
  { id: 9, name: 'Beacon, Cardinal N' },
  { id: 10, name: 'Beacon, Cardinal E' },
  { id: 11, name: 'Beacon, Cardinal S' },
  { id: 12, name: 'Beacon, Cardinal W' },
  { id: 13, name: 'Beacon, Port Hand' },
  { id: 14, name: 'Beacon, Starboard Hand' },
  { id: 15, name: 'Beacon, Preferred Channel Port Hand' },
  { id: 16, name: 'Beacon, Preferred Channel Starboard Hand' },
  { id: 17, name: 'Beacon, Isolated Danger' },
  { id: 18, name: 'Beacon, Safe Water' },
  { id: 19, name: 'Beacon, Special Mark' },
  { id: 20, name: 'Cardinal Mark N' },
  { id: 21, name: 'Cardinal Mark E' },
  { id: 22, name: 'Cardinal Mark S' },
  { id: 23, name: 'Cardinal Mark W' },
  { id: 24, name: 'Port Hand Mark' },
  { id: 25, name: 'Starboard Hand Mark' },
  { id: 26, name: 'Preferred Channel Port Hand' },
  { id: 27, name: 'Preferred Channel Starboard Hand' },
  { id: 28, name: 'Isolated danger' },
  { id: 29, name: 'Safe Water' },
  { id: 30, name: 'Special Mark' },
  { id: 31, name: 'Light Vessel/LANBY/Rigs' }
]

const atonTypeMap = new Map<number, string>(
  ATON_TYPES.map(({ id, name }) => [id, name])
)

export function getAtonTypeName(id: number): string | undefined {
  return atonTypeMap.get(id)
}
