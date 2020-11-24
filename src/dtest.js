const DeltaEditor = require('./deltaeditor')

const de = new DeltaEditor()

de.load('../test_server_config/baseDeltas.json')

//console.log(JSON.stringify(de.setValue('vessels.self', 'design.crap', 20), null, 2))

//console.log(JSON.stringify(de.setValue('vessels.self', 'design.draft', 20), null, 2))

//console.log(JSON.stringify(de.getValue('vessels.self', 'design.draft'), null, 2))

//console.log(JSON.stringify(de.getMeta('vessels.self', 'environment.head.temperature'), null, 2))

//console.log(JSON.stringify(de.getValue('vessels.self', 'name'), null, 2))

//console.log(JSON.stringify(de.setValue('vessels.self', 'name', 'New Name'), null, 2))

//console.log(JSON.stringify(de.getValue('vessels.self', 'name'), null, 2))

//console.log(JSON.stringify(de.setMeta('vessels.self', 'some.meta.path', 20), null, 2))

console.log(
  JSON.stringify(de.setValue('vessels.crapola', 'name', 'New Name'), null, 2)
)

de.removeValue('vessels.crapola', 'name')

de.removeValue('vessels.self', 'design.airHeight')

de.removeMeta('vessels.self', 'environment.head.temperature')

console.log(JSON.stringify(de.deltas, null, 2))
