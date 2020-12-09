const Song = require('./song');
const { Socket } = require('net');
const { EventEmitter } = require('events');

const DEF_PORT = 6600;
const DEF_HOST = 'localhost';
const DEF_SOCKET = '/var/run/mpd/socket';
const DEF_CONN_TYPE = 'network';
const CONN_TYPES = ['ipc', 'network'];
const RECONNECT_INTERVAL = 5000;
const CONST_FILE_LINE_START = 'file:';
const GENERIC_COMMANDS = ['play', 'stop', 'pause', 'next', 'previous', 'toggle', 'clear'];

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
   */
  constructor(options = {}) {
    super();
    // Applying options.
    this.ipc = options.ipc || DEF_SOCKET;
    this.host = options.host || DEF_HOST;
    this.port = options.port || DEF_PORT;
    this.type = CONN_TYPES.includes(options.type) ? options.type : DEF_CONN_TYPE;
    // Init props.
    this.songs = [];
    this.status = {};
    this.server = {};
    this.buffer = '';
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

  genericCommand(cmdLine) {
    return this._sendCommand(cmdLine).then(r => this._answerCallbackError(r));
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
    return this._sendCommand('add', name).then(r => this._answerCallbackError(r));
  }

  playId(id) {
    return this._sendCommand('play', id).then(r => this._answerCallbackError(r));
  }

  deleteId(id) {
    return this._sendCommand(`delete`, id).then(r => this._answerCallbackError(r));
  }

  volume(vol) {
    return this._sendCommand('setvol', vol).then(r => this._answerCallbackError(r));
  }

  repeat(repeat = 1) {
    return this._sendCommand('repeat', repeat).then(r => this._answerCallbackError(r));
  }

  seek(songId, time) {
    return this._sendCommand('seek', songId, time).then(r => this._answerCallbackError(r));
  }

  searchAdd(search) {
    let args = ['searchadd'];
    for(let key in search) {
      args.push(key);
      args.push(search[key]);
    }
    return this._sendCommand(...args).then(r => this._answerCallbackError(r));
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
        this.client.once('data', this._initialGreeting.bind(this));
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

  parseStatusResponse(message) {
    let array = message.split("\n");
    for (let i in array) {
      let keyValue = array[i].split(':');
      if (keyValue.length < 2) {
        if (array[i] !== 'OK') {
          this.restoreConnection();
          throw new Error('Unknown response while fetching status.');
        }
        continue;
      }
      let key = keyValue[0].trim();
      let value = keyValue[1].trim();
      switch(key) {
      case 'volume':
        this.status.volume = parseFloat(value.replace('%', '')) / 100;
        break;
      case 'repeat':
        this.status.repeat = (value === '1');
        break;
      case 'single':
        this.status.single = (value === '1');
        break;
      case 'consume':
        this.status.consume = (value === '1');
        break;
      case 'playlistlength':
        this.status.playlistlength = parseInt(value);
        break;
      case 'state':
        this.status.state = value;
        break;
      case 'xfade':
        this.status.xfade = parseInt(value);
        break;
      case 'song':
        this.status.song = parseInt(value);
        break;
      case 'time':
        this.status.time = {
          elapsed: parseInt(keyValue[1]),
          length: parseInt(keyValue[2])
        };
        break;
      case 'bitrate':
        this.status.bitrate = parseInt(value);
        break;
      }
    }
    return this.status;
  }

  updateStatus() {
    return this._sendCommand('status').then(this.parseStatusResponse.bind(this));
  }

  /**
   * Idle handling
   */
  _onMessage(message) {
    try {
      const match = message.match(/changed:\s*(.*?)\s+OK/);
      if (!match) {
        this.restoreConnection();
        throw new Error('Received unknown message during idle: ' + message);
      }
      this._enterIdle();
      const updated = match[1];
      const afterUpdate = () => {
        this.emit('update', updated);
        this.emit('status', updated);
      };
      switch(updated) {
      case 'mixer':
      case 'player':
      case 'options':
        this.updateStatus().then(afterUpdate);
        break;
      case 'playlist':
        this._updatePlaylist().then(afterUpdate);
        break;
      case 'database':
        this._updateSongs().then(afterUpdate);
        break;
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
      throw new Error("Unknown values while receiving initial greeting");
    }
    this.server.name = m[1];
    this.server.version = m[2];
    this._enterIdle();
    this.client.on('data', this._onData.bind(this));
    this.updateStatus()
      .then(this._updateSongs.bind(this))
      .then(this._updatePlaylist.bind(this))
      .then(this._setReady.bind(this))
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
    this.buffer += !data ? '' : data.trim();
    const index = this.findReturn(this.buffer);
    if (index === -1) return;
    // We found a return mark
    const string = this.buffer.substring(0, index).trim();
    this.buffer = this.buffer.substring(index, this.buffer.length);
    if (this.idling) {
      this._onMessage(string);
    } else if (this.commanding) {
      this._handleResponse(string);
    }
  }

  /**
   * Idling
   */
  _enterIdle() {
    this.idling = true;
    this.commanding = false;
    this._write('idle');
  }

  _leaveIdle(callback) {
    this.idling = false;
    this.client.once('data', () => {
      this.commanding = true;
      callback();
    });
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
    let request = this._requests.shift();
    if (!request) return;
    this.busy = true;
    let deque = () => {
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
    const callback = this._activeListener;
    if (!callback) return;
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
