

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
  update.values.forEach(addValue.bind(this, context, update.source));
}

function addValue(context, source, pathValue) {
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
    valueLeaf.values[sourceId].source = source;

    valueLeaf.value = pathValue.value;
    valueLeaf.source = source;
  } else if (!valueLeaf.source || isMatchingSource(valueLeaf.source, source)) {
    //first or same source as previous value
    valueLeaf.value = pathValue.value;
    valueLeaf.source = source;
  } else { // first multiple value
    valueLeaf.values = {};

    var sourceId = getId(valueLeaf.source);
    valueLeaf.values[sourceId] = {};
    valueLeaf.values[sourceId].value = valueLeaf.value;
    valueLeaf.values[sourceId].source = valueLeaf.source;

    valueLeaf.value = pathValue.value;
    valueLeaf.source = source;

    sourceId = getId(source);
    valueLeaf.values[sourceId] = {};
    valueLeaf.values[sourceId].value = pathValue.value;
    valueLeaf.values[sourceId].source = source;
  }
}

function isMatchingSource(source1, source2) {
  return source1.label === source2.label &&
         source1.type === source2.type &&
         source1.src === source2.src &&
         source1.pgn === source2.pgn;
}
function getId(source) {
  return source.label + '-' + source.src + '-' + source.pgn;
 }
module.exports = FullSignalK;