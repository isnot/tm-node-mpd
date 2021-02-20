const proto = require('../src/protocol');

describe('Test parseKvp function', () => {
  test('Is defined', () => expect(proto.parseKvp).toBeDefined());
  test('Throw error if no data passed', () =>
    expect(() => {
      proto.parseKvp();
    }).toThrow('found void data in parseKvp'));
  test('Throw error if passed string doesnt match kvp format', () => {
    expect(() => {
      proto.parseKvp('no kvp');
    }).toThrow('occurred invalid string in parseKvp');
  });
  test('Returned Object if passed string matches kvp format', () => {
    expect(typeof proto.parseKvp('vol: 42')).toBe('object');
    expect(typeof proto.parseKvp('vol: 42')).not.toBeNull();
  });
  test('Returned value has key prop if passed string matches kvp format', () => {
    const kvp = proto.parseKvp('vol: 42');
    expect(kvp.key).toBeDefined();
  });
  test('Returned value has val prop if passed string matches kvp format', () => {
    const kvp = proto.parseKvp('vol: 42');
    expect(kvp.val).toBeDefined();
  });
  test('Returns a kvp object if passed string matches kvp format', () => {
    const kvp = proto.parseKvp('vol: 42');
    expect(kvp.key).toBe('vol');
    expect(kvp.val).toBe('42');
  });
  test('Returnse values contain white spaces.', () => {
    expect.assertions(2);
    expect(proto.parseKvp('Artist: Various Artists')).not.toHaveProperty('val', 'Various');
    expect(proto.parseKvp('Title: Lazy fox jumps.')).toHaveProperty('val', 'Lazy fox jumps.');
  });
});

describe('Test parseGreeting function', () => {
  const error_message = 'occurred invalid string in parseGreeting';
  test('Is defined', () => expect(proto.parseGreeting).toBeDefined());
  test('Throw error if no data passed', () =>
    expect(() => {
      proto.parseGreeting();
    }).toThrow(error_message));
  test('Throw error if passed string doesnt match greetings format', () => {
    expect(() => {
      proto.parseGreeting('Failed greetings');
    }).toThrow(error_message);
  });
  test('Returned Object if passed string matches greetings format', () => {
    expect(typeof proto.parseGreeting('OK MPD 0.20.2')).toBe('object');
    expect(typeof proto.parseGreeting('OK MPD 0.20.2')).not.toBeNull();
  });
  test('Returned value has name prop if passed string matches greetings format', () => {
    const greeting = proto.parseGreeting('OK MPD 0.20.2');
    expect(greeting.name).toBeDefined();
  });
  test('Returned value has version prop if passed string matches greetings format', () => {
    const greeting = proto.parseGreeting('OK MPD 0.20.2');
    expect(greeting.version).toBeDefined();
  });
  test('Returns a protocol info object if passed string matches greetings format', () => {
    const greeting = proto.parseGreeting('OK MPD 0.20.2');
    expect(greeting.name).toBe('MPD');
    expect(greeting.version).toBe('0.20.2');
  });
});

describe('Test returnPatterns function', () => {
  test('Is defined', () => expect(proto.returnPatterns).toBeDefined());
  test('Returns an array', () => expect(Array.isArray(proto.returnPatterns())).toBe(true));
  test('Returned array is not empty', () => expect(proto.returnPatterns().length).toBeTruthy());
});

describe('Test findReturn function', () => {
  test('Is defined', () => expect(proto.findReturn).toBeDefined());
  test('Throw error if no data passed', () =>
    expect(() => {
      proto.findReturn();
    }).toThrow('no params found in findReturn'));
  test('Throw error if passed string does not contain mpd return mark', () => {
    expect(() => {
      proto.findReturn('Some test message');
    }).toThrow('no marks has been found in findReturn');
  });
});
