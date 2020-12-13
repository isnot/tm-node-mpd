const Song = require('./song');
const { Socket } = require('net');
const { EventEmitter } = require('events');

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

if (!String.prototype.trim) {
  (function() {
    // Make sure we trim BOM and NBSP
    const rtrim = /^[\s\uFEFF\xA0]+|[\s\uFEFF\xA0]+$/g;
    String.prototype.trim = function() {
      return this.replace(rtrim, '');
    };
  })();
}

if (!String.prototype.startsWith) {
  String.prototype.startsWith = function(searchString, position) {
    position = position || 0;
    return this.lastIndexOf(searchString, position) === position;
  };
}

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
    this.initGenericCommand();
    this.on('disconnected', () => this.restoreConnection());
    return this;
  }

  alive() {
    return this.connected;
  }

  _checkReturn(msg) {
    if (msg === 'OK') return;
    return new Error(`Bad status: "${msg}" after command "${this._activeMessage}"`);
  }

  _answerCallbackError(r) {
    const err = this._checkReturn(r);
    if (err) throw err;
  }

  genericCommand() {
    return this._sendCommand(...arguments).then(r => this._answerCallbackError(r));
  }

  initGenericCommand() {
    for (let cmd of GENERIC_COMMANDS) {
      this[cmd] = this.genericCommand.bind(this, [cmd]);
    }
  }

  updateSongs() {
    return this._sendCommand('update')
      .then((r) => {
        let arr = r.split(/\n/);
        return this._answerCallbackError(arr[1]);
      });
  }

  add(name) {
    return this.genericCommand('add', name);
  }

  playId(id) {
    return this.genericCommand('play', id);
  }

  deleteId(id) {
    return this.genericCommand('delete', id);
  }

  volume(vol) {
    return this.genericCommand('setvol', vol);
  }

  repeat(repeat = 1) {
    return this.genericCommand('repeat', repeat);
  }

  crossfade(seconds = 0) {
    return this.genericCommand('crossfade', seconds);
  }

  seek(songId, time) {
    return this.genericCommand('seek', songId, time);
  }

  searchAdd(search) {
    let args = ['searchadd'];
    for (let key in search) {
      args.push(key);
      args.push(search[key]);
    }
    return this.genericCommand(...args);
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
        this.client.once('data', data => this._initialGreeting(data));
      });
      // Connecting to the MPD via IPC or TCP.
      this.client.connect(...(this.type === 'ipc' ? [this.ipc] : [this.port, this.host]));
    } catch(e) {
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
  _updatePlaylist() {
    return this._sendCommand('playlistinfo')
      .then((message) => {
        let lines = message.split("\n");
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
            pos = parseInt(line.split(':')[1].trim());
          } else {
            songLines.push(line);
          }
        }
        if (songLines.length !== 0 && pos !== -1) {
          this.playlist[pos] = new Song(songLines);
        }
        this._answerCallbackError(lines[lines.length - 1]);
        return this.playlist;
      });
  }

  _updateSongs() {
    return this._sendCommand('listallinfo')
      .then((message) => {
        let lines = message.split("\n");
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
        if(songLines.length !== 0) {
          this.songs.push(new Song(songLines));
        }
        this._answerCallbackError(lines[lines.length - 1]);
        return this.songs;
      });
  }

  parseKvp(kvp = '') {
    const m = kvp.match(/(\S+)\s*:\s*(\S+)/);
    return !Array.isArray(m) || m.length !== 3
      ? false
      : { key: m[1].trim(), val: m[2].trim() };
  }

  parseStatusResponseValue({ key, val }) {
    switch (key) {
      case 'repeat':
      case 'single':
      case 'random':
      case 'consume': return val === '1';
      case 'song':
      case 'xfade':
      case 'bitrate':
      case 'playlist':
      case 'playlistlength': return parseInt(val, 10);
      case 'volume': return parseFloat(val.replace('%', '')) / 100;
      case 'time': {
        const times = val.split(':');
        return { elapsed: times[0], length: times[1] };
      }
      default: return val;
    }
  }

  parseStatusResponse(message) {
    for (let line of message.split("\n")) {
      if (line === 'OK') continue;
      const kvp = this.parseKvp(line);
      if (kvp === false) {
        throw new Error(`Unknown response while fetching status: ${line}`);
      }
      this.status[kvp.key] = this.parseStatusResponseValue(kvp);
    }
    return this.status;
  }

  updateStatus() {
    return this._sendCommand('status')
      .then(r => this.parseStatusResponse(r));
  }

  /**
   * Handle updates while in idle mode.
   * @param {string} message Message from MPD.
   */
  async _onMessage(message) {
    try {
      // It is possible to get a change event or just OK message
      // as an answer on idle request.
      if (message.match(/^\s*OK/)) return;
      const matches = [...message.matchAll(/changed:\s*(.*)/g)];
      if (!matches.length) {
        this.restoreConnection();
        throw new Error(`Received unknown message during idle: ${message}`);
      }
      for (const match of matches) {
        const update = match[1];
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
        // this._enterIdle();
      }
    } catch(e) {
      this.emit('error', e);
    }
  }

  /*
   * Message handling
   */

  _setReady() {
    this.emit('ready', this.status, this.server);
  }

  /**
   * Initiate MPD connection with greeting message.
   * According to the MPD protocol documentation when the client connects to the server,
   * the server will answer with the following line: 'OK MPD version'
   * where version is a protocol version identifier such as 0.12.2.
   * @param {string} message 
   */
  _initialGreeting(message) {
    const m = message.match(/OK\s(.+)\s(.+)/);
    if (!Array.isArray(m) || m.length !== 3) {
      this.restoreConnection();
      throw new Error('Unknown values while receiving initial greeting');
    }
    this.server.name = m[1];
    this.server.version = m[2];
    if (this.type === 'network' && this.keepAlive) {
      this.client.setKeepAlive(this.keepAlive);
    }
    this._enterIdle();
    this.client.on('data', data => this._onData(data));
    this.updateStatus()
      .then(() => this._updateSongs())
      .then(() => this._updatePlaylist())
      .then(() => this._setReady())
      .catch(e => this.emit('error', e));
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

  _onData(data) {
    if (!this.idling && !this.commanding) return;
    this[buffer] += !data ? '' : data.trim();
    const index = this.findReturn(this[buffer]);
    if (index === -1) return;
    // We found a return mark
    const string = this[buffer].substring(0, index).trim();
    this[buffer] = this[buffer].substring(index, this[buffer].length);
    if (this.idling) {
      this._onMessage(string);
    } else if (this.commanding) {
      this._handleResponse(string);
    }
  }

  /**
   * Idling
   * According to the mpd proto docs, player could send new events after idle command.
   * So client data handler run once to catch new updates.
   */
  _enterIdle() {
    this.idling = true;
    this.commanding = false;
    this.client.once('data', (data) => {
      this.emit('idle', true, data);
      this._onMessage(data);
    });
    this._write('idle');
    
  }

  _leaveIdle(callback) {
    this.idling = false;
    let done = false;
    const handler = (data) => {
      done = true;
      this.emit('idle', false, data);
      this.commanding = true;
      callback();
    };
    // In some cases MPD doesn't send anythig if noidle have sent.
    // For such cases we can just try to reschedule noidle.
    setTimeout(() => {
      if (done) return;
      this._enterIdle();
      this.client.removeListener('data', handler);
      this._leaveIdle(callback);
    }, 500);
    this.client.once('data', handler);
    this._write('noidle');
  }

  _checkIdle() {
    if (!this._activeListener && this._requests.length == 0 && !this.idling) {
      this._enterIdle();
    }
  }

  /**
   * Sending messages
   */

  _checkOutgoing() {
    if (this._activeListener || this.busy) return;
    const request = this._requests.shift();
    if (!request) return;
    this.busy = true;
    const deque = () => {
      this._activeListener = request.callback;
      this._activeMessage = request.message;
      this.busy = false;
      this._write(request.message);
    };
    if (this.idling) {
      this._leaveIdle(deque);
    } else {
      deque();
    }
  }

  _sendCommand() {
    if (arguments.length === 0) return;
    const cmd = arguments[0];
    let args = '';
    for (let i = 1; i < arguments.length; i += 1) {
      args += ' "' + arguments[i] + '" ';
    }
    return this._send(cmd + args);
  }

  _send(message) {
    return new Promise((resolve, reject) => {
      try {
        this._requests.push({ message, callback: resolve, errorback: reject });
        this._checkOutgoing();
      } catch(e) {
        reject(e);
      }
    });
  }

  _handleResponse(message) {
    if (!this._activeListener) return;
    const callback = this._activeListener;
    this._activeListener = null;
    this._checkOutgoing();
    this._checkIdle();
    callback(message);
  }

  _write(text) {
    try {
      if (!this.connected) {
        this.restoreConnection();
        throw new Error('Disconnect while writing to MPD: ' + text);
      }
      this.client.write(text + "\n");
    } catch(e) {
      this.emit('error', e);
    }
  }
};
