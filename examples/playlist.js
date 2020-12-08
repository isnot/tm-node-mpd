const MPD = require('../');

const settings = {
  host: process.env.MPD_HOST || 'localhost',
  port: process.env.MPD_PORT || 6600
};

console.log(`Creating MPD instance for service on ${settings.host}:${settings.port}`);
const mpd = new MPD(settings);

mpd.on('ready', () => {
  console.log(`MPD connection is ready, protocol ver ${mpd.server.version}.`)
  if (mpd.playlist.length === 0) console.log(`MPD playlist is empty.`);
	for (let num = 0; num < mpd.playlist.length; num += 1) {
		console.log(`${num + 1}: ${mpd.playlist[num].artist} - ${mpd.playlist[num].title}`);
  }
  console.log(`Disconnecting from ${settings.host}:${settings.port}`);
	mpd.disconnect();
});

console.log(`Connecting to the MPD service...`);
mpd.connect();
