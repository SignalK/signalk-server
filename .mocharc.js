module.exports = {
  require: ['ts-node/register'],
  extensions: ['ts', 'tsx', 'js'],
  // Whichever suite runs first pays a one-off cost that dwarfs the work it is
  // timing: loading dist/ and the first plugin scan take tens of seconds on a
  // cold cache, while every later server start is a few hundred milliseconds.
  // Which suite pays it depends on file ordering, so a budget that fits a warm
  // start makes the first suite fail seemingly at random.
  timeout: 120000,
  exit: true
}
