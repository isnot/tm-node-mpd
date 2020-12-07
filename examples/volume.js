const MPD = require('../');

const volume = process.argv.length > 2 ? parseInt(process.argv[2], 10) : 30;
const settings = {
  host: 'localhost',
	port: process.env.MPD_PORT || 6600
};

console.log(`Connecting to the MPD service on ${settings.host}:${settings.port}`);
const mpd = new MPD(settings);

mpd.on('ready', async () => {
  try {
    console.log(`MPD connection is ready, protocol ver ${mpd.server.version}.`)
    console.log(`Sending volume ${volume} command...`);
    await mpd.volume(volume);
    console.log(`Command volume ${volume} has been successfully sent.`);
  } catch (e) {
    console.error(e);
  } finally {
    console.log(`Disconnecting from ${settings.host}:${settings.port}`);
    mpd.disconnect();
  }
});

mpd.connect();
