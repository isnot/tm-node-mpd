const { parseKvp } = require('../src/protocol');

test('parseKvp should return false if no data passed', () => {
  expect(parseKvp()).toBe(false);
});
