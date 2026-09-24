import { parseRecords, RECORD_LABELS } from '../../functions/data';
import type { GameRecords, RecordKey } from '../../functions/data';

export const RECOVERY_KEY = 'little-break-cloud-recovery-v1';
const keys = Object.keys(RECORD_LABELS) as RecordKey[];
type BeforeRestore = Partial<Record<RecordKey, string | null>>;

export function collectRecords(storage: Storage): GameRecords {
  const records: GameRecords = {};
  for (const key of keys) {
    const value = storage.getItem(key);
    if (value !== null) records[key] = value;
  }
  return parseRecords(records);
}

function writeRecords(storage: Storage, records: BeforeRestore): void {
  for (const key of keys) {
    if (!Object.hasOwn(records, key)) continue;
    const value = records[key];
    if (value === null) storage.removeItem(key);
    else if (value !== undefined) storage.setItem(key, value);
  }
}

export function restoreRecords(storage: Storage, input: GameRecords): void {
  const records = parseRecords(input);
  if (!Object.keys(records).length) throw new Error('备份中没有可以恢复的数据。');
  const previous: BeforeRestore = {};
  for (const key of Object.keys(records) as RecordKey[]) previous[key] = storage.getItem(key);
  storage.setItem(RECOVERY_KEY, JSON.stringify({ version: 1, previous }));
  try { writeRecords(storage, records); }
  catch {
    try { writeRecords(storage, previous); }
    catch { throw new Error('恢复中断，本机数据可能只恢复了一部分。请先使用“撤销上次恢复”，不要继续游戏。'); }
    throw new Error('恢复失败，已还原本机原数据。请检查浏览器存储空间。');
  }
}

export function undoRestore(storage: Storage): void {
  const raw = storage.getItem(RECOVERY_KEY);
  if (!raw) throw new Error('没有可撤销的恢复。');
  const data = JSON.parse(raw);
  if (data?.version !== 1 || !data.previous || typeof data.previous !== 'object' || Array.isArray(data.previous)
    || !Object.entries(data.previous).every(([key, value]) => Object.hasOwn(RECORD_LABELS, key) && (value === null || typeof value === 'string'))) {
    throw new Error('本机恢复备份已损坏，未改动游戏数据。');
  }
  writeRecords(storage, data.previous);
  storage.removeItem(RECOVERY_KEY);
}
