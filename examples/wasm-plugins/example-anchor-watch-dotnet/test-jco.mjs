// Test running the jco-transpiled .NET WASM module
import * as dotnet from './jco-output/dotnet.js'

console.log('Loaded .NET WASM module via jco transpilation')
console.log('Exports:', Object.keys(dotnet))

// The component exports wasi:cli/run@0.2.0
if (dotnet.run) {
  console.log('Found run export:', dotnet.run)
  try {
    // Call the run function
    const result = dotnet.run.run()
    console.log('Run result:', result)
  } catch (err) {
    console.error('Run error:', err)
  }
}
