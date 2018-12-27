class Song{
	constructor(info) {
		if (Array.isArray(info)){
			return this.createFromInfoArray(info);
		}else{
			for(let key in info) {
				this[key] = info[key];
			}
			return this;
		}
	}

	flatCopy() {
		let obj = {};
		for(let key in this) {
			if(key !== "mpd"  && this.__proto__[key] === undefined) {
				obj[key] = this[key];
			}
		}
		return obj;
	}

	createFromInfoArray(lines) {
		let info = {};
		for(let i = 0; i < lines.length; i++) {
			let keyValue = lines[i].split(":");
			if(keyValue.length < 2) {
				if(lines[i] !== "OK") {
					throw new Error("Unknown response while parsing song.");
				}
				else {
					continue;
				}
			}
			let key = keyValue[0].trim();
			let value = keyValue[1].trim();
			switch(key) {
			case "file":
				info.file = value;
				break;
			case "Last-Modified":
				info.lastModified = new Date(value);
				break;
			case "Time":
				info.time = value;
				break;
			case "Artist":
				info.artist = value;
				break;
			case "Title":
				info.title = value;
				break;
			case "Track":
				info.track = value;
				break;
			case "Date":
				info.date = value;
				break;
			case "Genre":
				info.genre = value;
				break;
			}
		}
		return new Song(info);
	}
}
module.exports = Song;
