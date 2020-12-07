const RES_OK = 'OK';
const ERR_MSG_UNKNOWN = 'Unknown response while parsing song.';
const FIELD_FILE = 'file';
const FIELD_LAST_MODIFIED = 'Last-Modified';
const FIELD_TIME = 'Time';
const FIELD_ARTIST = 'Artist';
const FIELD_TITLE = 'Title';
const FIELD_TRACK = 'Track';
const FIELD_DATE = 'Date';
const FIELD_GENRE = 'Genre';

class Song {
  constructor(info) {
    if (Array.isArray(info)) return this.createFromInfoArray(info);
    for (let key in info) {
      this[key] = info[key];
    }
    return this;
  }

  flatCopy() {
    let obj = {};
    for (let key in this) {
      if(this.__proto__[key] === undefined) {
        obj[key] = this[key];
      }
    }
    return obj;
  }

  createFromInfoArray(lines) {
    let info = {};
    for(let i = 0; i < lines.length; i++) {
      let keyValue = lines[i].split(':');
      if(keyValue.length < 2) {
        if(lines[i] !== RES_OK) {
          throw new Error(ERR_MSG_UNKNOWN);
        }
        else {
          continue;
        }
      }
      let key = keyValue[0].trim(),
        value = keyValue[1].trim();
      switch(key) {
      case FIELD_FILE:
        info.file = value;
        break;
      case FIELD_LAST_MODIFIED:
        info.lastModified = new Date(value);
        break;
      case FIELD_TIME:
        info.time = value;
        break;
      case FIELD_ARTIST:
        info.artist = value;
        break;
      case FIELD_TITLE:
        info.title = value;
        break;
      case FIELD_TRACK:
        info.track = value;
        break;
      case FIELD_DATE:
        info.date = value;
        break;
      case FIELD_GENRE:
        info.genre = value;
        break;
      }
    }
    return new Song(info);
  }
}
module.exports = Song;
