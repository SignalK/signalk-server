

//TODO
// timestamp prune?


function FullSignalK(id, type) {
  this.root = {
    vessels: {}
  };
  this.root.vessels[id] = {};
  this.root.vessels[id][type] = id;
}

require("util").inherits(FullSignalK, require("events").EventEmitter);

FullSignalK.prototype.retrieve = function() {
  return this.root;
}

FullSignalK.prototype.addDelta = function(delta) {
  this.emit('delta', delta);
  var context = findContext(this.root, delta.context);
  delta.updates.forEach(addUpdate.bind(this, context));
};

function findContext(root, context) {
  var contextPointer = root;
  var pathParts = context.split('.');
  pathParts.forEach(function(pathPart) {
    if (!contextPointer[pathPart]) {
      contextPointer[pathPart] = {};
    }
    contextPointer = contextPointer[pathPart];
  });
  return contextPointer;
}


function addUpdate(context, update) {
  updateSource(context, update.source, update.timestamp);
  update.values.forEach(addValue.bind(this, context, update.source, update.timestamp));
}

function updateSource(context, source, timestamp) {
  var sourceId = getId(source);
  if (!context.sources) {
    context.sources = {};
  }
  if (!context.sources[source.label]) {
    context.sources[source.label] = {};
    context.sources[source.label].label = source.label;
    context.sources[source.label].type = source.type;
  }
  var canonicalSource = sourceId.split('.').reduce(function(pointer, pathPart) {
    if (!pointer[pathPart]) {
      pointer[pathPart] = {};
    }
    return pointer[pathPart];
  }, context.sources);
  if (source.src) {
    canonicalSource.src = source.src;
  }
  if (source.talker) {
    canonicalSource.talker = source.talker;
  }
  if (source.pgn) {
    if (!canonicalSource.pgns) {
      canonicalSource.pgns = {};
    }
    canonicalSource.pgns[source.pgn] = timestamp;
  }
  if (source.sentence) {
    if (!canonicalSource.sentences) {
      canonicalSource.sentences = {};
    }
    canonicalSource.sentences[source.sentence] = timestamp;
  }

}

function addValue(context, source, timestamp, pathValue) {
  if (pathValue.path != 'navigation.speedThroughWater') {
    return
  }
  var valueLeaf = pathValue.path.split('.').reduce(function(previous, pathPart) {
    if (!previous[pathPart]) {
      previous[pathPart] = {};
    }
    return previous[pathPart];
  }, context);

  if (valueLeaf.values) { //multiple values already
    var sourceId = getId(source);
    if (!valueLeaf.values[sourceId]) {
      valueLeaf.values[sourceId] = {};
    }
    valueLeaf.values[sourceId].value = pathValue.value;
    valueLeaf.values[sourceId].timestamp = timestamp;
    setMessage(valueLeaf.values[sourceId], source);
  } else if (valueLeaf.value && valueLeaf['$source'] != getId(source)) {
    // first multiple value
    valueLeaf.values = {};

    var sourceId = valueLeaf['$source'];
    valueLeaf.values[sourceId] = {};
    valueLeaf.values[sourceId].value = valueLeaf.value;
    valueLeaf.values[sourceId].timestamp = valueLeaf.timestamp;
    if (valueLeaf.pgn) {
      valueLeaf.values[sourceId].pgn = valueLeaf.pgn;
    }
    if (valueLeaf.sentence) {
      valueLeaf.values[sourceId].sentence = valueLeaf.sentence;
    }

    sourceId = getId(source);
    valueLeaf.values[sourceId] = {};
    valueLeaf.values[sourceId].value = pathValue.value;
    valueLeaf.values[sourceId].timestamp = timestamp;
    setMessage(valueLeaf.values[sourceId], source);
  }
  valueLeaf.value = pathValue.value;
  valueLeaf['$source'] = getId(source);
  valueLeaf.timestamp = timestamp;
  setMessage(valueLeaf, source);
}

function setMessage(leaf, source) {
  if (source.pgn) {
    leaf.pgn = source.pgn;
    delete leaf.sentence;
  }
  if (source.sentence) {
    leaf.sentence = source.sentence;
    delete leaf.pgn;
  }
}
function getId(source) {
  if (source.src || source.pgn) {
    return source.label +
    (source.src ? '.' + source.src : '') ;
  }
  return source.label +
    (source.talker ? '.' + source.talker : '.II') ; //needs real talker from nmea0183-parser
 }
module.exports = FullSignalK;