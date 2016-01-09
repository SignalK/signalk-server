var _ = require('lodash');

//TODO
// timestamp prune?


function FullSignalK(id, type) {
  this.root = {
    vessels: {}
  };
  this.root.vessels[id] = {};
  this.root.vessels[id][type] = id;
  this.self = this.root.vessels[id];
  this.sources = {};
  this.root.sources = this.sources;
}

require("util").inherits(FullSignalK, require("events").EventEmitter);

FullSignalK.prototype.retrieve = function() {
  return this.root;
}

FullSignalK.prototype.addDelta = function(delta) {
  this.emit('delta', delta);
  var context = findContext(this.root, delta.context);
  delta.updates.forEach(this.addUpdate.bind(this, context));
};

function findContext(root, contextPath) {
  var context = _.get(root, contextPath);
  if (!context) {
    context = {};
    _.set(root, contextPath, context);
  }
  return context;
}

FullSignalK.prototype.addUpdate = function(context, update) {
  this.updateSource(context, update.source, update.timestamp);
  update.values.forEach(addValue.bind(this, context, update.source, update.timestamp));
}

FullSignalK.prototype.updateSource = function(context, source, timestamp) {
  if (!this.sources[source.label]) {
    this.sources[source.label] = {};
    this.sources[source.label].label = source.label;
    this.sources[source.label].type = source.type;
  }

  if (source.type === 'NMEA2000' || source.src) {
    handleNmea2000Source(this.sources[source.label], source, timestamp);
    return
  }

  if (source.type === 'NMEA0183' || source.sentence) {
    handleNmea0183Source(this.sources[source.label], source, timestamp);
    return
  }

  handleOtherSource(this.sources[source.label], source, timestamp);
}

function handleNmea2000Source(labelSource, source, timestamp) {
  if (!labelSource[source.src]) {
    labelSource[source.src] = {
      src: source.src,
      pgns: {}
    };
  }
  labelSource[source.src].pgns[source.pgn] = timestamp
}

function handleNmea0183Source(labelSource, source, timestamp) {
  var talker = source.talker || 'II';
  if (!labelSource[talker]) {
    labelSource[talker] = {
      talker: talker,
      sentences: {}
    };
  }
  labelSource[talker].sentences[source.sentence] = timestamp
}

function handleOtherSource(sourceLeaf, source, timestamp) {
  sourceLeaf.timestamp = timestamp;
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
