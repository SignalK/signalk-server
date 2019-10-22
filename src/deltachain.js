function DeltaChain(dispatchMessage) {
  const chain = []
  let next = []

  this.process = function(msg) {
    return doProcess(0, msg)
  }

  function doProcess(index, msg) {
    if (index >= chain.length) {
      dispatchMessage(msg)
      return
    }
    chain[index](msg, next[index])
  }

  this.register = function(handler) {
    chain.push(handler)
    updateNexts()
    return () => {
      const handlerIndex = chain.indexOf(handler)
      if (handlerIndex >= 0) {
        chain.splice(handlerIndex, 1)
        updateNexts()
      }
    }
  }

  function updateNexts() {
    next = chain.map((chainElement, index) => {
      return msg => {
        doProcess(index + 1, msg)
      }
    })
  }
}

module.exports = DeltaChain
