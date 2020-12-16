const proto = require('../src/protocol');

describe('Test parseKvp function', () => {
  test('Is defined', () => expect(proto.parseKvp).toBeDefined());
  test('Returns false if no data passed', () => expect(proto.parseKvp()).toBe(false));
  test('Returns false if passed string doesnt match kvp format', () => {
    expect(proto.parseKvp('no kvp')).toBe(false);
  });
  test('Doesnt returns false if passed string matches kvp format', () => {
    expect(proto.parseKvp('vol: 42')).toBeTruthy();
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
});

describe('Test parseGreeting function', () => {
  test('Is defined', () => expect(proto.parseGreeting).toBeDefined());
  test('Returns false if no data passed', () => expect(proto.parseGreeting()).toBe(false));
  test('Returns false if passed string doesnt match greetings format', () => {
    expect(proto.parseGreeting('Failed greetings')).toBe(false);
  });
  test('Doesnt returns false if passed string matches greetings format', () => {
    expect(proto.parseGreeting('OK MPD 0.20.2')).toBeTruthy();
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
