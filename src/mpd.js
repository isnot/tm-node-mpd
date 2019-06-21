const Socket = require('net').Socket;
const EventEmitter = require("events").EventEmitter;
const Song = require("./song");
const RECONNECT_INTERVAL = 5000;
const CONST_FILE_LINE_START = "file:";
const GENERIC_COMMANDS = ['play', 'stop', 'pause', 'next', 'previous', 'toggle'];

if(!String.prototype.trim) {
	(function() {
		// Make sure we trim BOM and NBSP
		let rtrim = /^[\s\uFEFF\xA0]+|[\s\uFEFF\xA0]+$/g;
		String.prototype.trim = function() {
			return this.replace(rtrim, '');
		};
	})();
}

if(!String.prototype.startsWith) {
	String.prototype.startsWith = function(searchString, position) {
		position = position || 0;
		return this.lastIndexOf(searchString, position) === position;
	};
}

class MPD extends EventEmitter{
	constructor(options){
		super(options);
		this.port = options.port ? options.port : 6600;
		this.host = options.host ? options.host : "localhost";
		this._requests = [];
		this.connected = false;
		this.disconnecting = false;
		this.status = {};
		this.server = {};
		this.playlist = [];
		this.songs = [];
		this.buffer = "";
		this.initGenericCommand();
		this.on('disconnected', this.restoreConnection.bind(this));
		return this;
	}

	genericCommand(cmdLine){
		return this._sendCommand(cmdLine).then(this._answerCallbackError);
	}

	initGenericCommand() {
		for(let cmd of GENERIC_COMMANDS){
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
		return this._sendCommand('add', name).then(this._answerCallbackError);
	}

	playId(id){
		return this._sendCommand('play', id).then(this._answerCallbackError);
	}

	songDelete(id){
		return this._sendCommand(`delete`, id).then(this._answerCallbackError);
	}

	volume(vol) {
		return this._sendCommand('setvol', vol).then(this._answerCallbackError);
	}

	repeat(repeat = 1){
		return this._sendCommand('repeat', repeat).then(this._answerCallbackError);
	}

	searchAdd(search) {
		let args = ['searchadd'];
		for(let key in search) {
			args.push(key);
			args.push(search[key]);
		}
		return this._sendCommand(...args).then(this._answerCallbackError);
	}

	_answerCallbackError(r) {
		let err = this._checkReturn(r);
		if (err) {
			throw err;
		}else{
			return;
		}
	}

	/*
	 * Connect and disconnect
	 */

	connect() {
		try{
			this.client = new Socket();
			this.client.setEncoding('utf8');
			this.commanding = true;
			this.disconnecting = false;
			this.connected = false;
			this.client.once('end', ()=> {
				if(!this.disconnecting) {
					this.connected = false;
					this.emit('disconnected');
				}
			});
			this.client.on('error', (e)=>{
				this.connected = false;
				this.emit('error', e);
				this.emit('disconnected');
			});
			this.client.connect(this.port, this.host, () => {
				this.connected = true;
				clearInterval(this.reconnectInterval);
				this.reconnectInterval = null;
				this.client.once('data', this._initialGreeting.bind(this));
			});
		}catch(e){
			this.restoreConnection();
		}
	}

	restoreConnection(){
		if(this.reconnectInterval){
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
		this.client.destroy();
		delete this.client;
	}


	/*
	 * Not-so-toplevel methods
	 */

	_updatePlaylist(callback) {
		this._sendCommand('playlistinfo', (message) => {
			let lines = message.split("\n");
			this.playlist = [];
			let songLines = [];
			let pos;
			for(let i = 0; i < lines.length - 1; i++) {
				let line = lines[i];
				if(i !== 0 && line.startsWith('file:')) {
					this.playlist[pos] = new Song(songLines);
					songLines = [];
					pos = -1;
				}
				if(line.startsWith('Pos')) {
					pos = parseInt(line.split(':')[1].trim());
				}
				else {
					songLines.push(line);
				}
			}
			if(songLines.length !== 0 && pos !== -1) {
				this.playlist[pos] = new Song(songLines);
			}
			let err = this._checkReturn(lines[lines.length - 1]);
			if(err) { throw err; }
			if(callback) {
				callback(this.playlist);
			}
		});
	}

	_updateSongs(callback) {
		this._sendCommand('listallinfo', (message) => {
			let lines = message.split("\n");
			this.songs = [];
			let songLines = [];
			for(let i = 0; i < lines.length - 1; i++) {
				let line = lines[i];
				if(i !== 0 && line.startsWith(CONST_FILE_LINE_START)) {
					this.songs.push(new Song(songLines));
					songLines = [];
				}
				songLines.push(line);
			}
			if(songLines.length !== 0) {
				this.songs.push(new Song(songLines));
			}
			let err = this._checkReturn(lines[lines.length - 1]);
			if(err) { throw err; }
			if(callback) {
				callback(this.songs);
			}
		});
	}

	parseStatusResponse(message){
		let array = message.split("\n");
		for(let i in array) {
			let keyValue = array[i].split(":");
			if(keyValue.length < 2) {
				if(array[i] !== "OK") {
					this.restoreConnection();
					throw new Error("Unknown response while fetching status.");
				}
				else {
					continue;
				}
			}
			let key = keyValue[0].trim();
			let value = keyValue[1].trim();
			switch(key) {
			case "volume":
				this.status.volume = parseFloat(value.replace("%", "")) / 100;
				break;
			case "repeat":
				this.status.repeat = (value === "1");
				break;
			case "single":
				this.status.single = (value === "1");
				break;
			case "consume":
				this.status.consume = (value === "1");
				break;
			case "playlistlength":
				this.status.playlistlength = parseInt(value);
				break;
			case "state":
				this.status.state = value;
				break;
			case "xfade":
				this.status.xfade = parseInt(value);
				break;
			case "song":
				this.status.song = parseInt(value);
				break;
			case "time":
				this.status.time = {
					elapsed : parseInt(keyValue[1]),
					length : parseInt(keyValue[2])
				};
				break;
			case "bitrate":
				this.status.bitrate = parseInt(value);
				break;
			}
		}
		return this.status;
	}

	updateStatus() {
		return this._sendCommand('status').then(this.parseStatusResponse);
	}

	/*
	 * Idle handling
	 */

	_onMessage(message) {
		try{
			let match;
			if(!(match = message.match(/changed:\s*(.*?)\s+OK/))) {
				this.restoreConnection();
				throw new Error('Received unknown message during idle: ' + message);
			}

			this._enterIdle();
			let updated = match[1];
			let afterUpdate = () =>{
				this.emit('update', updated);
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
		}catch(e){
			this.emit('error', e);
		}
	}

	/*
	 * Message handling
	 */

	_initialGreeting(message) {
		//console.log("Got initial greeting: " + message);
		let m = message.match(/OK\s(.*?)\s((:?[0-9]|\.))/);
		if(m){
			this.server.name = m[1];
			this.server.version = m[2];
		}
		else {
			this.restoreConnection();
			throw new Error("Unknown values while receiving initial greeting");
		}
		this._enterIdle();
		this.client.on('data', this._onData.bind(this));
		//this._enterIdle();
		this.updateStatus(() => {
			this._updateSongs(() => {
				this._updatePlaylist(this._setReady.bind(this));
			});
		});
	}

	_setReady() {
		this.emit('ready', this.status, this.server);
	}

	findReturn(message) {
		let rOk = /OK(?:\n|$)/g;
		let rAck = /ACK\s*\[\d*\@\d*]\s*\{.*?\}\s*.*?(?:$|\n)/g;
		let arr = rOk.exec(message);
		if(arr) {
			return arr.index + arr[0].length;
		}
		else {
			arr = rAck.exec(message);
			if(arr) {
				return arr.index + arr[0].length;
			}else{
				return -1;
			}
		}
	}

	_onData(message) {
		if(!message) {
			message = "";
		}
		message = message.trim();
		//console.log("RECV: " + message);
		if(this.idling || this.commanding) {
			this.buffer += message;
			let index;
			if((index = this.findReturn(this.buffer)) !== -1) { // We found a return mark
				let string = this.buffer.substring(0, index).trim();
				this.buffer = this.buffer.substring(index, this.buffer.length);
				//console.log("PARSED: " + string);
				//console.log("Message returned: " + string);
				if(this.idling) {
					this._onMessage(string);
				}
				else if(this.commanding) {
					//console.log("onData response for: \"" + message + "\"");
					this._handleResponse(string);
				}
			}
			//else console.log("Doesn't have return: " + this.buffer);
		}
	}

	_checkReturn(msg) {
		if(msg !== 'OK') {
			return new Error(`Non okay return status: "${msg}"`);
		}
	}

	/*
	 * Idling
	 */

	_enterIdle() {
		this.idling = true;
		this.commanding = false;
		this._write("idle");
	}

	_leaveIdle(callback) {
		this.idling = false;
		this.client.once("data", () =>{
			//this._checkReturn(message.trim());
			this.commanding = true;
			callback();
		});
		this._write("noidle");
	}

	_checkIdle() {
		//console.log(this._requests.length + " pending requests");
		if(!this._activeListener && this._requests.length == 0 && !this.idling) {
			//console.log("No more requests, entering idle.");
			this._enterIdle();
		}
	}

	/*
	 * Sending messages
	 */

	_checkOutgoing() {
		if(this._activeListener || this.busy) {
			//console.log("No deque as active listener.");
			return;
		}
		let request = this._requests.shift();
		if(request) {
			//console.log("Pending deque, leaving idle.");
			this.busy = true;
			let deque = () => {
				//console.log("Dequed.");
				this._activeListener = request.callback;
				this.busy = false;
				this._write(request.message);
			};
			if(this.idling) {
				this._leaveIdle(deque);
			}
			else {
				deque();
			}
		}
	}

	_sendCommand() {
		let cmd = '', args = '';
		if(arguments.length == 0) {
			return;
		}
		if(arguments.length >= 1) {
			cmd = arguments[0];
		}
		for(let i = 1; i < arguments.length-1; i++) {
			args += ' "' + arguments[i] + '" ';
		}
		return this._send(cmd + args);
	}

	_send(message) {
		return new Promise((resolve, reject)=>{
			try{
				this._requests.push({
					message : message,
					callback : resolve,
					errorback: reject
				});
				this._checkOutgoing();
			}catch(e){
				reject(e);
			}
		});
	}

	_handleResponse(message) {
		let callback = this._activeListener;
		//console.log("Handling response: \"" + message + "\" active listener is " + this._activeListener);
		if(callback) {
			this._activeListener = null;
			this._checkOutgoing();
			//console.log("Checking idle as message was sucessfully answered.");
			this._checkIdle();
			callback(message);
		}
	}

	_write(text) {
		try{
			if(this.connected){
				this.client.write(text + "\n");
			}else{
				this.restoreConnection();
				throw new Error('Disconnect while writing to MPD: ' + text);
			}
		}catch(e){
			this.emit('error', e);
		}
	}

	alive(){
		return this.connected;
	}
}



module.exports = MPD;
