const Mpd = require('../src/mpd');

test('Mpd class exist', () => expect(Mpd).toBeDefined());

/* eslint-disable security-node/detect-crlf */
const mpd = new Mpd({ type: 'ipc' });
describe('Mpd short operation to change the volume.', () => {
  beforeAll(async () => {
    mpd.on('update', (changed) => {
      console.log(`Mpd on update: ${changed}`);
    });
    await mpd.connect();
    await new Promise((resolve) => setTimeout(resolve, 1000));
    await mpd.play();
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

describe('Mpd parse messages from "change events" while idle-ing.', () => {
  test('single: options', () => {
    expect.assertions(1);
    expect(
      mpd._matchAllChanged(`changed: options
OK`)
    ).toMatchObject(['options']);
  });
  test('multiple: mixer x3', () => {
    expect.assertions(1);
    expect(
      mpd._matchAllChanged(`changed: mixer
changed: mixer
changed: mixer
OK`)
    ).toMatchObject(['mixer', 'mixer', 'mixer']);
  });
  test('No matching event', () => {
    expect.assertions(1);
    expect(mpd._matchAllChanged('OK')).toHaveLength(0);
  });
  test('unexpected or void message', () => {
    expect.assertions(4);
    expect(mpd._matchAllChanged(undefined)).toHaveLength(0);
    expect(mpd._matchAllChanged(null)).toHaveLength(0);
    expect(mpd._matchAllChanged('')).toHaveLength(0);
    expect(mpd._matchAllChanged(9999)).toHaveLength(0);
  });
});
