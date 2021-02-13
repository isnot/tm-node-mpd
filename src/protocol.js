
/**
 * Parses KVP from MPD responses.
 * Some commands return data before the response ends with OK.
 * Each line is usually in the form NAME: VALUE.
 * @param {string} kvp String to parse for kvp.
 * @returns {Object|false} KVP object of false if parsing failed.
 */
module.exports.parseKvp = (kvp = '') => {
  if (!kvp) {
    throw new Error('found void data in parseKvp');
  }
  const m = kvp.match(/(\S+)\s*:\s*(.+)$/);
  if (Array.isArray(m) && m.length === 3) {
    return { key: m[1].trim(), val: m[2].trim() };
  }
  throw new Error('occurred invalid string in parseKvp');
};

/**
 * Parses MPD Greeting message
 * According to the MPD protocol documentation when the client connects to the server,
 * the server will answer with the following line: 'OK MPD version'
 * where version is a protocol version identifier such as 0.12.2.
 * @param {string} message MPD greeting message.
 * @returns {Object} mpd protocol details: { name: service name(MPD), version: protocol version}.
 */
module.exports.parseGreeting = (message = '') => {
  const m = message.match(/OK\s(.+)\s(.+)/);
  if (Array.isArray(m) && m.length === 3) {
    return { name: m[1], version: m[2] };
  }
  throw new Error('occurred invalid string in parseGreeting');
};
