module.exports = {
  require: ['ts-node/register', 'test/setup.ts'],
  extensions: ['ts', 'tsx', 'js'],
  timeout: 20000,
  exit: true
}
