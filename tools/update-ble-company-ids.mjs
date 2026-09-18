#!/usr/bin/env node
// Regenerates src/api/ble/bleCompanyIds.json from the Bluetooth SIG
// assigned-numbers list. Identifiers the SIG has dropped from its published
// list are kept: devices in the field keep advertising them.
import { readFileSync, writeFileSync } from 'node:fs'

const SOURCE =
  'https://bitbucket.org/bluetooth-SIG/public/raw/main/assigned_numbers/company_identifiers/company_identifiers.yaml'
const TARGET = new URL('../src/api/ble/bleCompanyIds.json', import.meta.url)

const unquote = (s) =>
  s.startsWith("'")
    ? s.slice(1, -1).replaceAll("''", "'")
    : s.startsWith('"')
      ? JSON.parse(s)
      : s

const yaml = await (await fetch(SOURCE)).text()
const upstream = new Map()
for (const m of yaml.matchAll(/^\s*- value:\s*(0x[0-9A-Fa-f]+)\s*\n\s*name:\s*(.+?)\s*$/gm)) {
  upstream.set(parseInt(m[1], 16), unquote(m[2]))
}
if (upstream.size < 4000) throw new Error(`only ${upstream.size} identifiers parsed`)

const current = JSON.parse(readFileSync(TARGET, 'utf8')).company_identifiers
const merged = new Map(current.map(({ value, name }) => [value, name]))
let added = 0
let renamed = 0
for (const [value, name] of upstream) {
  if (!merged.has(value)) added++
  else if (merged.get(value) !== name) renamed++
  merged.set(value, name)
}
const retired = [...merged.keys()].filter((v) => !upstream.has(v)).length

const company_identifiers = [...merged]
  .sort(([a], [b]) => b - a)
  .map(([value, name]) => ({ value, name }))
writeFileSync(TARGET, JSON.stringify({ company_identifiers }, null, 2) + '\n')
console.log(`upstream ${upstream.size}, added ${added}, renamed ${renamed}, retired kept ${retired}, total ${company_identifiers.length}`)
