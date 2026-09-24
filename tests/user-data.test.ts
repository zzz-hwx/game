import test from 'node:test';
import assert from 'node:assert/strict';
import { MAX_BYTES, parseRecords, parseSnapshot, RECORD_LABELS } from '../functions/data';
import { collectRecords, RECOVERY_KEY, restoreRecords, undoRestore } from '../src/data/local';
import { Game2048, SAVES_STORAGE_KEY, STORAGE_KEY } from '../src/games/2048/engine';

class MemoryStorage implements Storage {
  values = new Map<string, string>();
  failKey: string | null = null;
  get length() { return this.values.size; }
  key(index: number) { return [...this.values.keys()][index] ?? null; }
  clear() { this.values.clear(); }
  getItem(key: string) { return this.values.get(key) ?? null; }
  removeItem(key: string) { this.values.delete(key); }
  setItem(key: string, value: string) {
    if (key === this.failKey) { this.failKey = null; throw new DOMException('Full', 'QuotaExceededError'); }
    this.values.set(key, value);
  }
}
const game = new Game2048(() => 0);
game.move('left');
const allRecords = {
  'little-break-snake': JSON.stringify({ best: 10, level: 'normal', sound: false }),
  'between-blocks-best': '25',
  'link-and-chill-records': JSON.stringify({ easy: 100, normal: 0, hard: 0 }),
  'link-and-chill-records-zen': JSON.stringify({ easy: 10, normal: 0, hard: 0 }),
  'link-and-chill-records-gravity': JSON.stringify({ easy: 30, normal: 0, hard: 0 }),
  'little-break-minesweeper-records': JSON.stringify({ easy: 0, normal: null, hard: 50 }),
  [STORAGE_KEY]: game.serialize(100),
  [SAVES_STORAGE_KEY]: JSON.stringify({ version: 1, saves: [game.createSave('existing-save', Date.now())] }),
  'little-break-sokoban-v1': JSON.stringify({ version: 1, levelIndex: 2, best: [5, null, 10] }),
  'little-break-pacman-best-v1': '150',
  'little-break-breakout-best-v1': '100',
  'little-break-flappy-bird-best-v1': '0',
};

test('collects every existing persisted game format without touching unrelated browser data', () => {
  const storage = new MemoryStorage();
  Object.entries(allRecords).forEach(([key, value]) => storage.setItem(key, value));
  storage.setItem('session-token', 'never-upload');
  storage.setItem(RECOVERY_KEY, 'never-upload');
  assert.equal(Object.keys(allRecords).length, Object.keys(RECORD_LABELS).length);
  assert.deepEqual(collectRecords(storage), allRecords);
});

test('fresh browser has no records; zero scores and null minesweeper times are valid', () => {
  assert.deepEqual(collectRecords(new MemoryStorage()), {});
  assert.doesNotThrow(() => parseRecords(allRecords));
});

test('rejects unknown keys, malformed records, unsupported versions and oversized payloads', () => {
  for (const value of [null, [], { 'session-token': 'secret' }, JSON.parse('{"__proto__":"x"}'),
    { 'between-blocks-best': '-1' }, { 'between-blocks-best': '"3"' }, { [STORAGE_KEY]: '{' },
    { [STORAGE_KEY]: JSON.stringify({ ...JSON.parse(game.serialize(4)), version: 2 }) },
    { [SAVES_STORAGE_KEY]: JSON.stringify({ version: 1, saves: [{}] }) },
    { 'little-break-snake': 'x'.repeat(MAX_BYTES + 1) }]) assert.throws(() => parseRecords(value));
});

test('validates cloud envelope and 2048 previous snapshot', () => {
  const id = 'aa115032-bd8e-4e61-b58b-f78e2b3fbe5a';
  assert.equal(parseSnapshot({ version: 1, id, owner: 'A', createdAt: new Date().toISOString(), records: allRecords }).id, id);
  assert.throws(() => parseSnapshot({ version: 2, id, owner: 'A', createdAt: new Date().toISOString(), records: allRecords }));
  assert.throws(() => parseRecords({ [SAVES_STORAGE_KEY]: JSON.stringify({ version: 1, saves: [{ ...game.createSave('s', 1), previous: {} }] }) }));
});

test('restore replaces only included records and undo restores absent or corrupt original data', () => {
  const storage = new MemoryStorage();
  storage.setItem('between-blocks-best', 'broken-original');
  storage.setItem('session-token', 'kept');
  storage.setItem('little-break-pacman-best-v1', '70');
  restoreRecords(storage, { 'between-blocks-best': '99', [STORAGE_KEY]: game.serialize(4) });
  assert.equal(storage.getItem('between-blocks-best'), '99');
  const restored = new Game2048();
  restored.restore(storage.getItem(STORAGE_KEY));
  assert.deepEqual(restored.board, game.board);
  assert.equal(storage.getItem('little-break-pacman-best-v1'), '70');
  undoRestore(storage);
  assert.equal(storage.getItem('between-blocks-best'), 'broken-original');
  assert.equal(storage.getItem(STORAGE_KEY), null);
  assert.equal(storage.getItem('session-token'), 'kept');
  assert.equal(storage.getItem(RECOVERY_KEY), null);
});

test('cannot write recovery backup means no game records are changed', () => {
  const storage = new MemoryStorage();
  storage.setItem('between-blocks-best', '12');
  storage.failKey = RECOVERY_KEY;
  assert.throws(() => restoreRecords(storage, { 'between-blocks-best': '99' }));
  assert.equal(storage.getItem('between-blocks-best'), '12');
});

test('partial restore rolls back and leaves recovery available', () => {
  const storage = new MemoryStorage();
  storage.setItem('between-blocks-best', '12');
  storage.failKey = STORAGE_KEY;
  assert.throws(() => restoreRecords(storage, { 'between-blocks-best': '99', [STORAGE_KEY]: game.serialize(4) }), /已还原/);
  assert.equal(storage.getItem('between-blocks-best'), '12');
  assert.equal(storage.getItem(STORAGE_KEY), null);
  assert.notEqual(storage.getItem(RECOVERY_KEY), null);
});

test('invalid recovery and empty snapshot never clear browser storage', () => {
  const storage = new MemoryStorage();
  storage.setItem('session-token', 'kept');
  storage.setItem(RECOVERY_KEY, JSON.stringify({ version: 1, previous: { 'session-token': null } }));
  assert.throws(() => undoRestore(storage));
  assert.throws(() => restoreRecords(storage, {}));
  assert.equal(storage.getItem('session-token'), 'kept');
});
