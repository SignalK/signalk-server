const B = require('baconjs')

module.exports = function combinePreferred (streams) {
  const latestTimestamps = []
  streams.slice(1).map((streamParam, i) => {
    return B.mergeAll(
      streams.slice(0, i + 1).map(x => x.stream.map(() => Date.now()))
    ).onValue(ts => (latestTimestamps[i] = ts))
  })
  const allstreams = streams.slice(1).map((x, i) =>
    x.stream.filter(() => {
      return Date.now() - latestTimestamps[i] > x.timeout
    })
  )
  allstreams.push(streams[0].stream)
  return B.mergeAll(allstreams)
}
