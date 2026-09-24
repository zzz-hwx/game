import { requireUser, UserContextError } from './auth.mjs';
import { MAX_BYTES, parseRecords, parseSnapshot, validId } from './data.ts';
import type { CloudSnapshot, GameRecords, SnapshotSummary } from './data.ts';

// The runtime SDK returns service JSON directly, NOT an MCP or Supabase wrapper.
export interface Storage {
  list(path: string, options: {
    limit: number; offset: number; sortBy: { column: 'created_at'; order: 'desc' };
  }): Promise<unknown>;
  upload(path: string, bytes: Uint8Array, options: {
    contentType: string; upsert: false;
  }): Promise<unknown>;
  download(path: string): Promise<Response>;
}
type CurrentUser = { user_id: string; name: string };
type UserReader = (request: Request) => CurrentUser | null | Promise<CurrentUser | null>;
const PAGE_SIZE = 10;
const ENVELOPE_BYTES = MAX_BYTES + 16 * 1024;
const TIMEOUT_MS = 15_000;

class HttpError extends Error {
  constructor(readonly status: number, readonly code: string) { super(code); }
}
class InvalidStoredSnapshot extends Error {}

function json(data: unknown, status = 200, extraHeaders: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'cache-control': 'no-store',
      'x-content-type-options': 'nosniff',
      ...extraHeaders,
    },
  });
}

// The SDK cannot abort requests; never replay a timed-out write.
async function storageCall<T>(operation: Promise<T>, dispose?: (value: T) => void): Promise<T> {
  let expired = false;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const deadline = new Promise<never>((_, reject) => {
    timer = setTimeout(() => {
      expired = true;
      reject(new HttpError(503, 'storage_unavailable'));
    }, TIMEOUT_MS);
  });
  try {
    return await Promise.race([
      operation.then(value => { if (expired) dispose?.(value); return value; }),
      deadline,
    ]);
  } finally { clearTimeout(timer); }
}

async function readBounded(source: Request | Response): Promise<unknown> {
  const length = source.headers.get('content-length');
  if (length !== null && /^\d+$/.test(length) && Number(length) > ENVELOPE_BYTES) {
    void source.body?.cancel().catch(() => {});
    throw new HttpError(413, 'payload_too_large');
  }
  if (!source.body) throw new HttpError(400, 'invalid_json');
  const reader = source.body.getReader();
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    const deadline = new Promise<never>((_, reject) => {
      timer = setTimeout(() => {
        reject(new HttpError(408, 'request_timeout'));
        void reader.cancel().catch(() => {});
      }, TIMEOUT_MS);
    });
    const consume = async () => {
      const chunks: Uint8Array[] = [];
      let size = 0;
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        size += value.byteLength;
        if (size > ENVELOPE_BYTES) throw new HttpError(413, 'payload_too_large');
        chunks.push(value);
      }
      const bytes = new Uint8Array(size);
      let offset = 0;
      for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
      return JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes)) as unknown;
    };
    return await Promise.race([consume(), deadline]);
  } catch (error) {
    if (error instanceof HttpError) throw error;
    throw new HttpError(400, 'invalid_json');
  } finally {
    clearTimeout(timer);
    // Do not await cancellation: an uncooperative input must not defeat timeout.
    void reader.cancel().catch(() => {});
    reader.releaseLock();
  }
}

async function readSnapshot(storage: Storage, path: string): Promise<CloudSnapshot> {
  const response = await storageCall(storage.download(path), late => {
    void late.body?.cancel().catch(() => {});
  });
  if (!response.ok) {
    void response.body?.cancel().catch(() => {});
    throw new HttpError(503, 'storage_unavailable');
  }
  let raw: unknown;
  try { raw = await readBounded(response); }
  catch { throw new HttpError(503, 'storage_unavailable'); }
  try {
    const snapshot = parseSnapshot(raw);
    if (!Object.keys(snapshot.records).length) throw new Error();
    return snapshot;
  } catch { throw new InvalidStoredSnapshot(); }
}

async function directoryFor(user: CurrentUser): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(user.user_id));
  const hash = Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, '0')).join('');
  return `users/${hash}/snapshots`;
}

function checkAccount(expected: unknown, user: CurrentUser): void {
  // A stale-tab guard only; the SDK identity and server path provide authority.
  if (expected !== user.user_id) throw new HttpError(409, 'account_changed');
}

function checkOrigin(request: Request, url: URL): void {
  const fetchSite = request.headers.get('sec-fetch-site')?.trim().toLowerCase();
  if (fetchSite === 'cross-site') throw new HttpError(403, 'invalid_origin');
  const origin = request.headers.get('origin');
  // Gateway verifies origin before rewriting the request URL.
  if (origin !== null && fetchSite !== 'same-origin' && origin !== url.origin) {
    throw new HttpError(403, 'invalid_origin');
  }
}

function sameRecords(left: GameRecords, right: GameRecords): boolean {
  const keys = Object.keys(left) as (keyof GameRecords)[];
  return keys.length === Object.keys(right).length && keys.every(key => left[key] === right[key]);
}

export function createHandler(storage: Storage, getCurrentUser: UserReader = requireUser) {
  return async (request: Request): Promise<Response> => {
    try {
      const url = new URL(request.url);
      const action = url.searchParams.get('action');
      if (action !== 'me' && action !== 'list' && action !== 'snapshot') {
        return json({ error: 'not_found' }, 404);
      }
      const allowed = action === 'snapshot' ? ['GET', 'POST'] : ['GET'];
      if (!allowed.includes(request.method)) {
        return json({ error: 'method_not_allowed' }, 405, { allow: allowed.join(', ') });
      }

      // Identity is trustworthy only behind the platform's non-bypassable Gateway.
      let current: CurrentUser | null;
      try { current = await getCurrentUser(request); }
      catch (error) {
        if (error instanceof UserContextError && error.code === 'login_required' && error.status === 401) {
          return json({ error: 'login_required' }, 401);
        }
        return json({ error: 'invalid_user_context' }, 403);
      }
      if (!current) return json({ error: 'login_required' }, 401);
      const user = { id: current.user_id, name: current.name };
      if (action === 'me') return json({ user });

      if (request.method === 'POST') {
        checkOrigin(request, url);
        if (request.headers.get('content-type')?.split(';')[0].trim().toLowerCase() !== 'application/json') {
          throw new HttpError(415, 'unsupported_media_type');
        }
        const body = await readBounded(request);
        if (!body || typeof body !== 'object' || Array.isArray(body)) throw new HttpError(400, 'invalid_snapshot');
        const input = body as Record<string, unknown>;
        checkAccount(input.expectedUserId, current);
        if (!validId(input.id)) throw new HttpError(400, 'invalid_id');
        let records: GameRecords;
        try { records = parseRecords(input.records); }
        catch { throw new HttpError(400, 'invalid_records'); }
        if (!Object.keys(records).length) throw new HttpError(400, 'invalid_records');
        const path = `${await directoryFor(current)}/${input.id}.json`;
        const intended: CloudSnapshot = {
          version: 1, id: input.id, owner: current.user_id, createdAt: new Date().toISOString(), records,
        };
        let uploadRejected = false;
        try {
          await storageCall(storage.upload(path, new TextEncoder().encode(JSON.stringify(intended)), {
            contentType: 'application/json; charset=utf-8', upsert: false,
          }));
        } catch { uploadRejected = true; }

        // A failed response can hide a committed upload; confirm by reading, not replaying.
        let actual: CloudSnapshot;
        try { actual = await readSnapshot(storage, path); }
        catch { throw new HttpError(503, 'write_result_unknown'); }
        if (actual.id !== intended.id || actual.owner !== current.user_id) {
          throw new HttpError(503, 'write_result_unknown');
        }
        if (!sameRecords(actual.records, records)) {
          throw new HttpError(uploadRejected ? 409 : 503, uploadRejected ? 'snapshot_conflict' : 'write_result_unknown');
        }
        return json({ user, snapshot: actual });
      }

      checkAccount(url.searchParams.get('expectedUserId'), current);
      const directory = await directoryFor(current);
      if (action === 'snapshot') {
        const id = url.searchParams.get('id');
        if (!validId(id)) throw new HttpError(400, 'invalid_id');
        const snapshot = await readSnapshot(storage, `${directory}/${id}.json`);
        if (snapshot.owner !== current.user_id || snapshot.id !== id) throw new HttpError(404, 'snapshot_not_found');
        return json({ user, snapshot });
      }

      const rawOffset = url.searchParams.get('offset') ?? '0';
      const offset = Number(rawOffset);
      if (!/^\d+$/.test(rawOffset) || !Number.isSafeInteger(offset) || offset > Number.MAX_SAFE_INTEGER - PAGE_SIZE) {
        throw new HttpError(400, 'invalid_offset');
      }
      const rows = await storageCall(storage.list(directory, {
        limit: PAGE_SIZE + 1, offset, sortBy: { column: 'created_at', order: 'desc' },
      }));
      if (!Array.isArray(rows)) throw new HttpError(503, 'storage_unavailable');
      const items: SnapshotSummary[] = [];
      for (const entry of rows.slice(0, PAGE_SIZE)) {
        if (!entry || typeof entry !== 'object' || typeof entry.name !== 'string' || !entry.name.endsWith('.json')) continue;
        const id = entry.name.slice(0, -5);
        if (!validId(id)) continue;
        let snapshot: CloudSnapshot;
        try { snapshot = await readSnapshot(storage, `${directory}/${id}.json`); }
        catch (error) { if (error instanceof InvalidStoredSnapshot) continue; throw error; }
        if (snapshot.owner !== current.user_id || snapshot.id !== id) continue;
        items.push({ id, createdAt: snapshot.createdAt, keys: Object.keys(snapshot.records) as SnapshotSummary['keys'] });
      }
      return json({ user, items, nextOffset: rows.length > PAGE_SIZE ? offset + PAGE_SIZE : null });
    } catch (error) {
      // No storage messages, upstream headers, internal URLs or credentials escape.
      return error instanceof HttpError
        ? json({ error: error.code }, error.status)
        : json({ error: 'storage_unavailable' }, 503);
    }
  };
}
