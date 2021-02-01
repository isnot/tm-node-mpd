const Song = require('./song');
const { Socket } = require('net');
const { EventEmitter } = require('events');
const { parseKvp, parseGreeting } = require('./protocol');

const DEF_PORT = 6600;
const DEF_HOST = 'localhost';
const DEF_SOCKET = '/var/run/mpd/socket';
const DEF_KEEP_ALIVE = false;
const DEF_CONN_TYPE = 'network';
const CONN_TYPES = ['ipc', 'network'];
const RECONNECT_INTERVAL = 5000;
const CONST_FILE_LINE_START = 'file:';
const GENERIC_COMMANDS = ['play', 'stop', 'pause', 'next', 'previous', 'toggle', 'clear'];

const buffer = Symbol('Read buffer');

module.exports = class MPD extends EventEmitter {
  /**
   * MPD connection constructor.
   * @param {Object} options MPD options.
   * @param {string} options.ipc Path to the IPC(Unix Domain Socket).
   * @param {string} options.host MPD service host.
   * @param {number} options.port MPD service TCP port.
   * @param {string} options.type MPD connection type: ipc/network.
   * @param {boolean} options.keepAlive Use keep alive for MPD network connection.
   */
  constructor(options = {}) {
    super();
    // Applying options.
    this.ipc = options.ipc || DEF_SOCKET;
    this.host = options.host || DEF_HOST;
    this.port = options.port || DEF_PORT;
    this.type = CONN_TYPES.includes(options.type) ? options.type : DEF_CONN_TYPE;
    this.keepAlive = !!options.keepAlive || DEF_KEEP_ALIVE;
    // Init props.
    this.songs = [];
    this.status = {};
    this.server = {};
    this[buffer] = '';
    this.playlist = [];
    this._requests = [];
    this.connected = false;
    this.disconnecting = false;
    this._initGenericCommand();
    this.on('disconnected', () => this.restoreConnection());
    return this;
  }

  /**
   * Sends a simple command specified in arguments to the mpd instance.
   * First argument should be a command name.
   * All further args will be uses as a command parameters.
   * @returns {Promise}
   */
  async command() {
    const r = await this._sendCommand(...arguments);
    return await this._answerCallbackError(r);
  }

  async query() {
    const r = await this._sendCommand(...arguments);
    const arr = r.split('\n');
    const res_status = arr.pop();
    await this._answerCallbackError(res_status);
    const data = {};
    try {
      for (const line of arr) {
        const kvp = parseKvp(line);
        data[kvp.key] = kvp.val;
      }
    } catch (e) {
      throw new Error(`An error occurred while parsing the query response. %o, $o`, arguments, e);
    }
    return data;
  }

  alive() {
    return this.connected;
  }

  async add(name) {
    return await this.command('add', name);
  }

  async playId(id) {
    return await this.command('play', id);
  }

  async deleteId(id) {
    return await this.command('delete', id);
  }

  async volume(vol) {
    return await this.command('setvol', vol);
  }

  async repeat(repeat = 1) {
    return await this.command('repeat', repeat);
  }

  async crossfade(seconds = 0) {
    return await this.command('crossfade', seconds);
  }

  async seek(songId, time) {
    return await this.command('seek', songId, time);
  }

  async updateSongs() {
    const r = await this._sendCommand('update');
    const arr = r.split(/\n/);
    return await this._answerCallbackError(arr[1]);
  }

  async searchAdd(search) {
    let args = ['searchadd'];
    for (let key in search) {
      args.push(key);
      args.push(search[key]);
    }
    return await this.command(...args);
  }

  /**
   * Connect and disconnect
   */
  connect() {
    try {
      this.client = new Socket();
      this.client.setEncoding('utf8');
      this.connected = false;
      this.commanding = true;
      this.disconnecting = false;
      this.client.once('end', () => {
        if (this.disconnecting) return;
        this.connected = false;
        this.emit('disconnected');
      });
      this.client.on('error', (e) => {
        this.connected = false;
        this.emit('error', e);
        this.emit('disconnected');
      });
      this.client.on('connect', () => {
        this.connected = true;
        clearInterval(this.reconnectInterval);
        this.reconnectInterval = null;
        this.client.once('data', async (data) => {
          await this._initialGreeting(data);
        });
      });
      // Connecting to the MPD via IPC or TCP.
      this.client.connect(...(this.type === 'ipc' ? [this.ipc] : [this.port, this.host]));
    } catch (e) {
      this.restoreConnection();
    }
  }

  restoreConnection() {
    if (this.reconnectInterval) {
      clearInterval(this.reconnectInterval);
    }
    this.reconnectInterval = setInterval(() => {
      this.disconnect();
      this.connect();
    }, RECONNECT_INTERVAL);
  }

  disconnect() {
    this.disconnecting = true;
    this.busy = false;
    this._activeListener = null;
    this._requests.splice(0, this._requests.length);
    if (this.client) {
      this.client.destroy();
      delete this.client;
    }
  }

  /**
   * Not-so-toplevel methods
   */

  _setReady() {
    this.emit('ready', this.status, this.server);
  }

  async _answerCallbackError(msg) {
    if (msg === 'OK') return;
    throw new Error(`Bad status: "${msg}" after command "${this._activeMessage}"`);
  }

  async _initGenericCommand() {
    for (let cmd of GENERIC_COMMANDS) {
      this[cmd] = await this.command.bind(this, [cmd]);
    }
  }

  async _updatePlaylist() {
    const message = await this._sendCommand('playlistinfo');
    const lines = message.split('\n');
    this.playlist = [];
    let songLines = [];
    let pos;
    for (let i = 0; i < lines.length - 1; i += 1) {
      let line = lines[i];
      if (i !== 0 && line.startsWith(CONST_FILE_LINE_START)) {
        this.playlist[pos] = new Song(songLines);
        songLines = [];
        pos = -1;
      }
      if (line.startsWith('Pos')) {
        pos = parseInt(line.split(':')[1].trim(), 10);
      } else {
        songLines.push(line);
      }
    }
    if (songLines.length !== 0 && pos !== -1) {
      this.playlist[pos] = new Song(songLines);
    }
    await this._answerCallbackError(lines[lines.length - 1]);
    return this.playlist;
  }

  async _updateSongs() {
    const message = await this._sendCommand('listallinfo');
    const lines = message.split('\n');
    this.songs = [];
    let songLines = [];
    for (let i = 0; i < lines.length - 1; i += 1) {
      let line = lines[i];
      if (i !== 0 && line.startsWith(CONST_FILE_LINE_START)) {
        this.songs.push(new Song(songLines));
        songLines = [];
      }
      songLines.push(line);
    }
    if (songLines.length !== 0) {
      this.songs.push(new Song(songLines));
    }
    await this._answerCallbackError(lines[lines.length - 1]);
    return this.songs;
  }

  _parseStatusResponseValue({ key, val }) {
    switch (key) {
      case 'repeat':
      case 'single':
      case 'random':
      case 'consume':
        return val === '1';
      case 'song':
      case 'xfade':
      case 'bitrate':
      case 'playlist':
      case 'playlistlength':
        return parseInt(val, 10);
      case 'volume':
        return parseFloat(val.replace('%', '')) / 100;
      case 'time': {
        const times = val.split(':');
        return { elapsed: times[0], length: times[1] };
      }
      default:
        return val;
    }
  }

  async _parseStatusResponse(message) {
    try {
      for (const line of message.split('\n')) {
        if (line === 'OK') continue;
        const kvp = parseKvp(line);
        this.status[kvp.key] = this._parseStatusResponseValue(kvp);
      }
    } catch (e) {
      throw new Error(`Unknown response while fetching status: ${e}`);
    }
    return this.status;
  }

  async updateStatus() {
    const r = await this._sendCommand('status');
    return await this._parseStatusResponse(r);
  }

  /*
   * Message handling
   */

  /**
   * Initiate MPD connection with greeting message.
   * @param {string} message
   */
  async _initialGreeting(message) {
    try {
      this.server = parseGreeting(message);
    } catch (e) {
      this.restoreConnection();
      throw new Error(`Unexpected greeting message: '${message}'! ${e}`);
    }
    if (this.type === 'network' && this.keepAlive) {
      this.client.setKeepAlive(this.keepAlive);
    }
    this.client.on('data', async (d) => {
      await this._onData(d);
    });
    try {
      await this.updateStatus();
      await this._updateSongs();
      await this._updatePlaylist();
      await this._setReady();
    } catch (e) {
      this.emit('error', e);
    }
  }

  findReturn(message) {
    const rOk = /OK(?:\n|$)/g;
    let arr = rOk.exec(message);
    if (arr) return arr.index + arr[0].length;
    // If response is not OK.
    const rAck = /ACK\s*\[\d*\@\d*]\s*\{.*?\}\s*.*?(?:$|\n)/g;
    arr = rAck.exec(message);
    return arr ? arr.index + arr[0].length : -1;
  }

  async _onData(data) {
    if (!this.idling && !this.commanding) return;
    this[buffer] += !data ? '' : data.trim();
    const index = this.findReturn(this[buffer]);
    if (index === -1) return;
    // We found a return mark
    const string = this[buffer].substring(0, index).trim();
    this[buffer] = this[buffer].substring(index, this[buffer].length);
    if (this.idling) {
      await this._onMessage(string);
    } else if (this.commanding) {
      await this._handleResponse(string);
    }
  }

  /**
   * Idling
   */

  _checkIdle() {
    if (this._activeListener || this._requests.length || this.idling) return;
    this._enterIdle();
  }

  _enterIdle() {
    this.idling = true;
    this.commanding = false;
    this._write('idle');
  }

  _leaveIdle(callback) {
    this.client.once('data', () => {
      this.idling = false;
      this.commanding = true;
      callback();
    });
    this._write('noidle');
  }

  /**
   * Handle idle mode updates.
   * @param {string} message Message from MPD.
   */
  async _onMessage(message) {
    try {
      this.idling = false;
      this.commanding = true;
      // It is possible to get a change event or just OK message
      if (message.match(/^\s*OK/)) return;
      const matches = [...message.match(/(?:changed:\s*)(.*)/g)];
      if (!matches.length) {
        this.restoreConnection();
        throw new Error(`Received unknown message during idle: ${message}`);
      }
      for (const match of matches) {
        const update = match.substring(9);
        const afterUpdate = () => {
          this.emit('update', update);
          this.emit('status', update);
        };
        switch (update) {
          case 'mixer':
          case 'player':
          case 'options':
            await this.updateStatus();
            afterUpdate();
            break;
          case 'playlist':
            await this._updatePlaylist();
            afterUpdate();
            break;
          case 'database':
            await this._updateSongs();
            afterUpdate();
            break;
        }
      }
      this._checkIdle();
    } catch (e) {
      this.emit('error', e);
    }
  }

  /**
   * Sending messages
   */

  _dequeue(request) {
    this.busy = false;
    this._activeListener = request.callback;
    this._activeMessage = request.message;
    this._write(request.message);
  }

  _checkOutgoing() {
    if (this._activeListener || this.busy) return;
    const request = this._requests.shift();
    if (!request) return;
    this.busy = true;
    return this.idling ? this._leaveIdle(() => this._dequeue(request)) : this._dequeue(request);
  }

  async _sendCommand() {
    if (arguments.length === 0) return;
    const cmd = arguments[0];
    let args = '';
    for (let i = 1; i < arguments.length; i += 1) {
      args += ' "' + arguments[i] + '" ';
    }
    return this._send(cmd + args);
  }

  async _send(message) {
    return new Promise((resolve, reject) => {
      try {
        this._requests.push({ message, callback: resolve, errorback: reject });
        this._checkOutgoing();
      } catch (e) {
        reject(e);
      }
    });
  }

  async _handleResponse(message) {
    if (!this._activeListener) return;
    const callback = this._activeListener;
    this._activeListener = null;
    this._checkOutgoing();
    this._checkIdle();
    await callback(message);
    return;
  }

  _write(text) {
    try {
      if (!this.connected) {
        this.restoreConnection();
        throw new Error('Disconnect while writing to MPD: ' + text);
      }
      this.client.write(text + '\n');
    } catch (e) {
      this.emit('error', e);
    }
  }
};
