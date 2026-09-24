export const MAX_BYTES = 512 * 1024;
export const RECORD_LABELS = {
  'little-break-snake': '贪吃蛇记录与设置',
  'between-blocks-best': '俄罗斯方块最高分',
  'link-and-chill-records': '连连看经典记录',
  'link-and-chill-records-zen': '连连看悠闲记录',
  'link-and-chill-records-gravity': '连连看重力记录',
  'little-break-minesweeper-records': '扫雷最佳用时',
  'little-break-2048': '2048 当前进度',
  'little-break-2048-saves': '2048 手动存档',
  'little-break-sokoban-v1': '推箱子关卡与记录',
  'little-break-pacman-best-v1': '吃豆人最高分',
  'little-break-breakout-best-v1': '打砖块最高分',
  'little-break-flappy-bird-best-v1': 'Flappy Bird 最高分',
} as const;
export type RecordKey = keyof typeof RECORD_LABELS;
export type GameRecords = Partial<Record<RecordKey, string>>;
export interface CloudSnapshot {
  version: 1;
  id: string;
  owner: string;
  createdAt: string;
  records: GameRecords;
}
export interface SnapshotSummary { id: string; createdAt: string; keys: RecordKey[] }
export const validId = (value: unknown): value is string => typeof value === 'string'
  && /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(value);
export const isObject = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === 'object' && !Array.isArray(value);
const count = (value: unknown): value is number => typeof value === 'number' && Number.isSafeInteger(value) && value >= 0;

function validBoard(value: unknown): boolean {
  return isObject(value) && Array.isArray(value.board) && value.board.length === 16
    && value.board.every(tile => count(tile) && (tile === 0 || (tile >= 2 && 2 ** Math.round(Math.log2(tile)) === tile)))
    && value.board.filter(tile => tile > 0).length >= 2
    && count(value.score) && count(value.moves) && typeof value.continued === 'boolean';
}

function validRecord(key: RecordKey, raw: string): boolean {
  const data: unknown = JSON.parse(raw);
  if (['between-blocks-best', 'little-break-pacman-best-v1', 'little-break-breakout-best-v1', 'little-break-flappy-bird-best-v1'].includes(key)) return count(data);
  if (!isObject(data)) return false;
  if (key === 'little-break-snake') return count(data.best) && ['easy', 'normal', 'hard'].includes(String(data.level)) && typeof data.sound === 'boolean';
  if (key === 'little-break-2048') return data.version === 1 && count(data.best) && validBoard(data);
  if (key === 'little-break-2048-saves') {
    if (data.version !== 1 || !Array.isArray(data.saves)) return false;
    const ids = new Set();
    return data.saves.every(save => {
      if (!isObject(save) || !validBoard(save) || typeof save.id !== 'string' || !save.id || ids.has(save.id)
        || !count(save.savedAt) || save.savedAt > 8.64e15 || (save.previous !== null && !validBoard(save.previous))) return false;
      ids.add(save.id);
      return true;
    });
  }
  if (key === 'little-break-sokoban-v1') return data.version === 1 && count(data.levelIndex)
    && Array.isArray(data.best) && data.best.every(value => value === null || (count(value) && value > 0));
  return Object.entries(data).every(([level, value]) => ['easy', 'normal', 'hard'].includes(level)
    && (count(value) || (key === 'little-break-minesweeper-records' && value === null)));
}

export function parseRecords(value: unknown): GameRecords {
  if (!isObject(value) || new TextEncoder().encode(JSON.stringify(value)).length > MAX_BYTES) throw new Error('invalid_records');
  for (const key of Object.keys(value)) {
    if (!Object.hasOwn(RECORD_LABELS, key)) throw new Error('invalid_records');
  }
  const records: GameRecords = {};
  for (const key of Object.keys(RECORD_LABELS) as RecordKey[]) {
    if (!Object.hasOwn(value, key)) continue;
    const raw = value[key];
    if (typeof raw !== 'string') throw new Error('invalid_records');
    try { if (!validRecord(key, raw)) throw new Error(); }
    catch { throw new Error(`invalid_record:${key}`); }
    records[key] = raw;
  }
  return records;
}

export function parseSnapshot(value: unknown): CloudSnapshot {
  if (!isObject(value) || value.version !== 1 || !validId(value.id)
    || typeof value.owner !== 'string' || !value.owner || value.owner.length > 128
    || typeof value.createdAt !== 'string' || !Number.isFinite(Date.parse(value.createdAt))) throw new Error('invalid_snapshot');
  return { version: 1, id: value.id, owner: value.owner, createdAt: value.createdAt, records: parseRecords(value.records) };
}
