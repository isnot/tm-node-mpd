
/**
 * Parses KVP from MPD responses.
 * Some commands return data before the response ends with OK.
 * Each line is usually in the form NAME: VALUE.
 * @param {string} kvp String to parse for kvp.
 * @returns {Object|false} KVP object or false if parsing failed.
 */
module.exports.parseKvp = (kvp = '') => {
  if (!kvp || typeof kvp !== 'string') {
    return false;
  }
  const m = kvp.match(/(\S+)\s*:\s*(.+)$/);
  return Array.isArray(m) && m.length === 3
    ? { key: m[1].trim(), val: m[2].trim() }
    : false;
};

/**
 * Parses MPD Greeting message
 * According to the MPD protocol documentation when the client connects to the server,
 * the server will answer with the following line: 'OK MPD version'
 * where version is a protocol version identifier such as 0.12.2.
 * @param {string} message MPD greeting message.
 * @returns {Object|false} mpd proto details: { name: service name(MPD), version: proto version}.
 */
module.exports.parseGreeting = (message = '') => {
  if (!message || typeof message !== 'string') {
    return false;
  }
  const m = message.match(/OK\s(.+)\s(.+)/);
  return Array.isArray(m) && m.length === 3
    ? { name: m[1], version: m[2] }
    : false;
};

/**
 * MPD protocol has several return patterns.
 * @returns {Array} Array with supported mpd return patterns.
 */
module.exports.returnPatterns = () => [
  /OK(?:\n|$)/g,
  /ACK\s*\[\d*\@\d*]\s*\{.*?\}\s*.*?(?:$|\n)/g
];

/**
 * Searchs for an mpd protocol return mark in the collected response data.
 * @param {string} message MPD message.
 * @returns {number|false} Total message length or false if no marks has been found.
 */
module.exports.findReturn = (message = '') => {
  if (!message) return false;
  for (let pattern of module.exports.returnPatterns()) {
    const arr = pattern.exec(message);
    if (arr) return arr.index + arr[0].length;
  }
  return false;
};
