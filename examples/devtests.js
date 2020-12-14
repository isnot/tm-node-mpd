const MPD = require('../');

const settings = {
  host: process.env.MPD_HOST || 'localhost',
  port: process.env.MPD_PORT || 6600
};

console.log(`Creating MPD instance for service on ${settings.host}:${settings.port}`);
const mpd = new MPD(settings);

// mpd.on('idle', (idle, data) => console.log('Idle: ', idle, data));
mpd.on('command', (data) => console.log('Sending command: ', data));
mpd.on('error', e => console.error(e));

mpd.on('ready', async () => {
  try {
    console.log(`MPD connection is ready, protocol ver ${mpd.server.version}.`)

    console.log(`Adding mock songs...`);
    const songs = [
      'Nobara_Hayakawa_-_01_-_Trail.mp3',
      'Monopole_-_02_-_Stereo-vision_radio.mp3',
      'Robin_Grey_-_01_-_These_Days.mp3'
    ]
    for (const song of songs) {
      await mpd.volume(25);
      console.log(`Command volume has been successfully sent.`)
      await mpd.add(song);
      console.log(`Command add has been successfully sent.`)
    }

    // console.log(mpd.status);
    // if (mpd.songs.length) console.log(mpd.songs);
    // if (mpd.playlist.length) console.log(mpd.playlist);
    setTimeout(async () => {
      await mpd.play();
      console.log(`Command play has been successfully sent.`);
    }, 1000);


    setTimeout(async () => {
      await mpd.stop();
      console.log(`Command stop has been successfully sent.`);
    }, 5000);
  } catch (e) {
    console.error(e);
  }
});

mpd.on('update', (status)  => {
  console.log('Update:', status);
  // switch(status) {
  //   case 'mixer':
  //   case 'player':
  //   case 'options': return console.log('Status after update', mpd.status);
  //   case 'playlist': return console.log('Playlist after update', mpd.playlist);
  //   case 'database': return console.log('Songs after update', mpd.songs);
  // }
});

mpd.connect();
