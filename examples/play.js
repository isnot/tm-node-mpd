const MPD = require('../');

const settings = {
  host: process.env.MPD_HOST || 'localhost',
  port: process.env.MPD_PORT || 6600
};

console.log(`Creating MPD instance for service on ${settings.host}:${settings.port}`);
const mpd = new MPD(settings);

mpd.on('ready', async () => {
  try {
    console.log(`MPD connection is ready, protocol ver ${mpd.server.version}.`)
    console.log(mpd.status);
    if (mpd.songs.length) console.log(mpd.songs);
    if (mpd.playlist.length) console.log(mpd.playlist);
    console.log(`Sending play command...`);
    await mpd.play();
    console.log(`Command play has been successfully sent.`);
  } catch (e) {
    console.error(e);
  }
});

mpd.on('update', (status)  => {
  console.log('Update:', status);
  switch(status) {
    case 'mixer':
    case 'player':
    case 'options': return console.log('Status after update', mpd.status);
    case 'playlist': return console.log('Playlist after update', mpd.playlist);
    case 'database': return console.log('Songs after update', mpd.songs);
  }
});

mpd.connect();
