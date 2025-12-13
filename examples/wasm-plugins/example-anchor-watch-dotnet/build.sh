#!/bin/bash
# Build script for anchor-watch-dotnet plugin

set -e

echo "Building anchor-watch-dotnet plugin..."

# Check prerequisites
if ! command -v dotnet &> /dev/null; then
    echo "Error: dotnet CLI not found. Please install .NET 10 SDK (Preview)."
    echo "Download from: https://dotnet.microsoft.com/download/dotnet/10.0"
    exit 1
fi

# Check .NET version (10+ preferred, 9+ minimum)
DOTNET_VERSION=$(dotnet --version | cut -d'.' -f1)
if [ "$DOTNET_VERSION" -lt 9 ]; then
    echo "Error: .NET 9 or later required. Current version: $(dotnet --version)"
    echo "For best WASI 3.0 support, use .NET 10 Preview"
    exit 1
fi

if [ "$DOTNET_VERSION" -lt 10 ]; then
    echo "Warning: Using .NET $DOTNET_VERSION. For best WASI 3.0 support, consider .NET 10 Preview"
fi

# Check if WASI workload is installed
if ! dotnet workload list | grep -q wasi; then
    echo "Error: WASI workload not installed."
    echo "Install with: dotnet workload install wasi-experimental"
    exit 1
fi

# Clean previous build
echo "Cleaning previous build..."
dotnet clean -c Release > /dev/null 2>&1 || true
rm -f plugin.wasm

# Build
echo "Building Release configuration..."
dotnet build -c Release

# Find and copy the WASM output
WASM_FILE=$(find bin/Release/net8.0/wasi-wasm -name "*.wasm" | head -n 1)

if [ -z "$WASM_FILE" ]; then
    echo "Error: WASM file not found in build output"
    exit 1
fi

echo "Copying WASM binary..."
cp "$WASM_FILE" plugin.wasm

# Show file size
SIZE=$(ls -lh plugin.wasm | awk '{print $5}')
echo "✓ Build successful! plugin.wasm ($SIZE)"

echo ""
echo "To install to Signal K:"
echo "  mkdir -p ~/.signalk/node_modules/@signalk/anchor-watch-dotnet"
echo "  cp plugin.wasm package.json ~/.signalk/node_modules/@signalk/anchor-watch-dotnet/"
