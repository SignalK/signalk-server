require('validate-peer-dependencies')(__dirname, {
  resolvePeerDependenciesFrom: './',
  handleFailure(result) {
    let { missingPeerDependencies, incompatibleRanges } = result

    let missingWithVersions = (missingPeerDependencies || []).reduce(
      (message, metadata) => {
        return `${message}${metadata.name}@${metadata.specifiedPeerDependencyRange} `
      },
      ''
    )

    let incompatiblePeerDependenciesMessage = (incompatibleRanges || []).reduce(
      (message, metadata) => {
        return `${message}\n\t* ${metadata.name}: \`${metadata.specifiedPeerDependencyRange}\`; it was resolved to \`${metadata.version}\``
      },
      ''
    )

    if (missingWithVersions.length > 0) {
      console.error(`Please INSTALL MISSING PEERDEPENDENCIES with
      npm install --save-dev ${missingWithVersions}`)
      process.exit(-1)
    }

    console.error(
      `Incompatible peerDependencies: ${incompatiblePeerDependenciesMessage}`
    )
    process.exit(-1)
  }
})
