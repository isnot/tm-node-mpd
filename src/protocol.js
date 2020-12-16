
/**
 * Parses KVP from MPD responses.
 * Some commands return data before the response ends with OK.
 * Each line is usually in the form NAME: VALUE.
 * @param {string} kvp String to parse for kvp.
 * @returns {Object|false} KVP object of false if parsing failed.
 */
module.exports.parseKvp = (kvp = '') => {
  if (!kvp) return false;
  const m = kvp.match(/(\S+)\s*:\s*(\S+)/);
  return !Array.isArray(m) || m.length !== 3
    ? false
    : { key: m[1].trim(), val: m[2].trim() };
};
