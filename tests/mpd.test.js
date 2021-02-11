const Mpd = require('../src/mpd');

test('Mpd class exist', () => expect(Mpd).toBeDefined());

/* eslint-disable security-node/detect-crlf */
const mpd = new Mpd({type: 'ipc'});
describe('Mpd TypeError occurred matchAll on update.', () => {
  beforeAll(async () => {
    mpd.on('update', (changed) => {
      console.log(`Mpd on update: ${changed}`);
    });
    await mpd.connect();
    await new Promise((resolve) => setTimeout(resolve, 1000));
  });
  afterAll(async () => {
    await new Promise((resolve) => setTimeout(resolve, 1000));
    await mpd.disconnect();
  });
  test('set volume to "60%"', async () => {
    expect.assertions(1);
    await expect(mpd.volume(60)).resolves.toBeUndefined();
  });
  test('volume should be "60%"', async () => {
    expect.assertions(1);
    await new Promise((resolve) => setTimeout(resolve, 3000));
    await expect(mpd.updateStatus()).resolves.toHaveProperty('volume', 0.6);
  });
  test('set volume to "100%"', async () => {
    expect.assertions(1);
    await expect(mpd.volume(100)).resolves.toBeUndefined();
  });
  test('volume should be "100%"', async () => {
    expect.assertions(1);
    await new Promise((resolve) => setTimeout(resolve, 3000));
    await expect(mpd.updateStatus()).resolves.toHaveProperty('volume', 1);
  });
});
/* eslint-enable security-node/detect-crlf */
