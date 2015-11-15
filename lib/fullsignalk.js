

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
  update.values.forEach(addValue.bind(this, context, update.source, update.timestamp));
}

function addValue(context, source, timestamp, pathValue) {
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

    valueLeaf.value = pathValue.value;
    valueLeaf['$source'] = sourceId;
    valueLeaf.timestamp = timestamp;
  } else if (!valueLeaf['$source'] || valueLeaf['$source'] === getId(source)) {
    //first value or update of a single value
    valueLeaf.value = pathValue.value;
    valueLeaf['$source'] = getId(source);
    valueLeaf.timestamp = timestamp;
  } else { // first multiple value
    valueLeaf.values = {};

    var sourceId = valueLeaf['$source'];
    valueLeaf.values[sourceId] = {};
    valueLeaf.values[sourceId].value = valueLeaf.value;
    valueLeaf.values[sourceId].timestamp = valueLeaf.timestamp;

    valueLeaf.value = pathValue.value;
    valueLeaf['$source'] = getId(source);
    valueLeaf.timestamp = timestamp;

    sourceId = getId(source);
    valueLeaf.values[sourceId] = {};
    valueLeaf.values[sourceId].value = pathValue.value;
    valueLeaf.values[sourceId].timestamp = timestamp;
  }
}

function getId(source) {
  try {
  if (source.src || source.pgn) {
    return source.label +
    (source.src ? '-' + source.src : '-') +
    (source.pgn ? '-' + source.pgn : '');
  }
  return source.label +
    (source.talker ? '-' + source.talker : '-') +
    (source.sentence ? '-' + source.sentence : '');
  } catch (ex) {
    console.log(ex.stack)
  }
 }
module.exports = FullSignalK;