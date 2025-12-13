/**
 * Post-processing script for jco transpiled output
 *
 * This script patches the jco-generated JavaScript to add the _initialize
 * and InitializeModules calls required by .NET NativeAOT WASM modules.
 *
 * .NET NativeAOT exports:
 * - _initialize: WASI reactor initialization
 * - InitializeModules: .NET runtime module initialization
 *
 * Both must be called before any other exports can be used.
 *
 * This is necessary because jco doesn't automatically call these for
 * reactor-style WASI components.
 */

const fs = require('fs')
const path = require('path')

const jcoOutputPath = path.join(__dirname, '..', 'jco-output', 'dotnet.js')

console.log('Patching jco output to add .NET initialization calls...')

let content = fs.readFileSync(jcoOutputPath, 'utf8')

// Check if already patched
if (content.includes('// Initialize .NET runtime')) {
  console.log('Already patched, skipping.')
  process.exit(0)
}

// Find the line "realloc1 = exports1.cabi_realloc;" and add initialization calls after it
const searchPattern = 'realloc1 = exports1.cabi_realloc;'
const initializeCall = `realloc1 = exports1.cabi_realloc;
    // Initialize .NET runtime - required before calling any exports
    // Note: _initialize internally calls InitializeModules, so we only call _initialize
    if (typeof exports1._initialize === 'function') {
      exports1._initialize();
    }`

if (!content.includes(searchPattern)) {
  console.error('Could not find insertion point for initialization calls')
  process.exit(1)
}

content = content.replace(searchPattern, initializeCall)

fs.writeFileSync(jcoOutputPath, content)
console.log('Successfully patched jco output with .NET initialization calls')
