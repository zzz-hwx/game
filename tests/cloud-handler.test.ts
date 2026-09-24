import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash, randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { createHandler } from '../functions/handler.ts';
import type { Storage } from '../functions/handler.ts';
import { MAX_BYTES } from '../functions/data.ts';
import type { CloudSnapshot, GameRecords } from '../functions/data.ts';

const A = { user_id: 'account/A:opaque', name: '玩家 A' };
const B = { user_id: 'account/B:opaque', name: '玩家 B' };
const RECORDS: GameRecords = { 'between-blocks-best': '42', 'little-break-pacman-best-v1': '100' };
const OTHER: GameRecords = { 'between-blocks-best': '99' };
const BASE = 'https://arcade.example/functions/v1/app';
const SECRET = 'provider-token secret upstream.example/internal';
const LIMIT = MAX_BYTES + 16 * 1024;
const directory = (user: typeof A) => `users/${createHash('sha256').update(user.user_id).digest('hex')}/snapshots`;
const pathFor = (user: typeof A, id: string) => `${directory(user)}/${id}.json`;

class FakeStorage implements Storage {
  objects = new Map<string, { bytes: Uint8Array; created_at: string }>();
  uploads: { path: string; options: { contentType: string; upsert: false } }[] = [];
  downloads: string[] = [];
  lists: { path: string; options: Parameters<Storage['list']>[1] }[] = [];
  uploadMode: 'normal' | 'commit-then-throw' | 'throw' | 'no-commit' = 'normal';
  failList = false;
  failDownload = false;
  listingOverride: unknown = undefined;
  downloadOverride?: (path: string) => Response;
  transformUpload?: (snapshot: CloudSnapshot) => unknown;
  sequence = 0;

  async list(path: string, options: Parameters<Storage['list']>[1]): Promise<unknown> {
    this.lists.push({ path, options });
    if (this.failList) throw new Error(SECRET);
    if (this.listingOverride !== undefined) return this.listingOverride;
    // Service contract: a raw array of immediate children, not {data,has_more}.
    return [...this.objects.entries()]
      .filter(([key]) => key.startsWith(`${path}/`) && !key.slice(path.length + 1).includes('/'))
      .map(([key, value]) => ({ name: key.slice(path.length + 1), created_at: value.created_at, metadata: { secret: SECRET } }))
      .sort((left, right) => right.created_at.localeCompare(left.created_at))
      .slice(options.offset, options.offset + options.limit);
  }

  async upload(path: string, bytes: Uint8Array, options: Parameters<Storage['upload']>[2]): Promise<unknown> {
    this.uploads.push({ path, options });
    assert.equal(options.upsert, false);
    if (this.objects.has(path) || this.uploadMode === 'throw') throw new Error(SECRET);
    if (this.uploadMode !== 'no-commit') {
      const stored = this.transformUpload
        ? new TextEncoder().encode(JSON.stringify(this.transformUpload(JSON.parse(new TextDecoder().decode(bytes)))))
        : bytes.slice();
      this.objects.set(path, { bytes: stored, created_at: new Date(1_700_000_000_000 + this.sequence++).toISOString() });
    }
    if (this.uploadMode === 'commit-then-throw') throw new Error(SECRET);
    return { Key: path, secret: SECRET, snapshot: 'not-authoritative' };
  }

  async download(path: string): Promise<Response> {
    this.downloads.push(path);
    if (this.failDownload) throw new Error(SECRET);
    if (this.downloadOverride) return this.downloadOverride(path);
    const stored = this.objects.get(path);
    // No invented status/statusCode shape: the reference only promises throws.
    if (!stored) throw new Error(SECRET);
    return new Response(new TextDecoder().decode(stored.bytes), {
      headers: { 'content-type': 'application/json', 'set-cookie': SECRET, 'x-provider-secret': SECRET },
    });
  }

  seed(user: typeof A, id: string, overrides: Record<string, unknown> = {}): void {
    this.objects.set(pathFor(user, id), {
      bytes: new TextEncoder().encode(JSON.stringify({
        version: 1, id, owner: user.user_id, createdAt: '2026-09-01T00:00:00.000Z', records: RECORDS, ...overrides,
      })),
      created_at: new Date(1_700_000_000_000 + this.sequence++).toISOString(),
    });
  }
}

function get(action: string, user: typeof A = A, params: Record<string, string> = {}): Request {
  return new Request(`${BASE}?${new URLSearchParams({ action, expectedUserId: user.user_id, ...params })}`);
}
function post(id = randomUUID(), records: unknown = RECORDS, extra: Record<string, unknown> = {}, headers: HeadersInit = {}): Request {
  return new Request(`${BASE}?action=snapshot`, {
    method: 'POST', headers: { 'content-type': 'application/json', ...headers },
    body: JSON.stringify({ id, expectedUserId: A.user_id, records, ...extra }),
  });
}
function streamRequest(chunks: Uint8Array[], headers: HeadersInit = {}): Request {
  let index = 0;
  return new Request(`${BASE}?action=snapshot`, {
    method: 'POST', headers: { 'content-type': 'application/json', ...headers },
    body: new ReadableStream<Uint8Array>({ pull(controller) {
      if (index < chunks.length) controller.enqueue(chunks[index++]);
      else controller.close();
    } }), duplex: 'half',
  } as RequestInit);
}
async function body(response: Response, status = 200) {
  assert.equal(response.status, status);
  assert.equal(response.headers.get('cache-control'), 'no-store');
  assert.match(response.headers.get('content-type') ?? '', /^application\/json/);
  assert.equal(response.headers.get('set-cookie'), null);
  assert.equal(response.headers.get('x-provider-secret'), null);
  const text = await response.text();
  assert.ok(!text.includes(SECRET));
  return JSON.parse(text);
}
async function error(response: Response, status: number, code: string) {
  assert.deepEqual(await body(response, status), { error: code });
}

// These fixtures verify application behavior, not Gateway signatures or ingress isolation.
test('cloud: A writes and restores actual server-owned bytes; GETs never write', async () => {
  const storage = new FakeStorage();
  const handler = createHandler(storage, () => A);
  const id = randomUUID();
  const start = Date.now();
  const result = await body(await handler(post(id)));
  assert.deepEqual(result.user, { id: A.user_id, name: A.name });
  assert.deepEqual(result.snapshot.records, RECORDS);
  assert.equal(result.snapshot.owner, A.user_id);
  assert.equal(result.snapshot.version, 1);
  assert.equal(result.snapshot.id, id);
  assert.ok(Date.parse(result.snapshot.createdAt) >= start && Date.parse(result.snapshot.createdAt) <= Date.now());
  assert.equal(new Date(result.snapshot.createdAt).toISOString(), result.snapshot.createdAt);
  assert.deepEqual(storage.uploads, [{ path: pathFor(A, id), options: { contentType: 'application/json; charset=utf-8', upsert: false } }]);
  assert.deepEqual(storage.downloads, [pathFor(A, id)]);
  assert.deepEqual(await body(await handler(get('snapshot', A, { id }))), result);
  assert.deepEqual(await body(await handler(get('me'))), { user: result.user });
  assert.equal(storage.uploads.length, 1);
});

test('cloud: B cannot list or restore A data, even when B knows the UUID', async () => {
  const storage = new FakeStorage();
  const id = randomUUID();
  await body(await createHandler(storage, () => A)(post(id)));
  const handlerB = createHandler(storage, () => B);
  assert.deepEqual(await body(await handlerB(get('list', B))), { user: { id: B.user_id, name: B.name }, items: [], nextOffset: null });
  await error(await handlerB(get('snapshot', B, { id })), 503, 'storage_unavailable');
  assert.equal(storage.downloads.at(-1), pathFor(B, id));
  assert.equal(storage.lists.at(-1)?.path, directory(B));
  assert.equal(storage.uploads.length, 1);
});

test('cloud: forged owner, directory, timestamps and query authority cannot redirect a write', async () => {
  const storage = new FakeStorage();
  const id = randomUUID();
  const result = await body(await createHandler(storage, () => A)(post(id, RECORDS, {
    owner: B.user_id, path: pathFor(B, id), prefix: directory(B), version: 999, createdAt: '1900-01-01T00:00:00.000Z',
  })));
  assert.equal(result.snapshot.owner, A.user_id);
  assert.equal(result.snapshot.version, 1);
  assert.notEqual(result.snapshot.createdAt, '1900-01-01T00:00:00.000Z');
  assert.deepEqual([...storage.objects.keys()], [pathFor(A, id)]);
  const restored = await body(await createHandler(storage, () => A)(get('snapshot', A, { id, owner: B.user_id, path: pathFor(B, id) })));
  assert.deepEqual(restored, result);
});

test('cloud: stored owner, stored id and schema are independently checked', async () => {
  const storage = new FakeStorage();
  const handler = createHandler(storage, () => B);
  for (const overrides of [{ owner: A.user_id }, { id: randomUUID() }]) {
    const id = randomUUID();
    storage.seed(B, id, overrides);
    await error(await handler(get('snapshot', B, { id })), 404, 'snapshot_not_found');
  }
  for (const overrides of [{ version: 2 }, { records: { arbitrary: 'secret' } }, { records: {} }]) {
    const id = randomUUID();
    storage.seed(B, id, overrides);
    await error(await handler(get('snapshot', B, { id })), 503, 'storage_unavailable');
  }
  assert.deepEqual((await body(await handler(get('list', B)))).items, []);
});

test('cloud: authentication is required for all data actions; context errors are safe 403s', async () => {
  const storage = new FakeStorage();
  const handler = createHandler(storage);
  for (const request of [get('me'), get('list'), get('snapshot', A, { id: randomUUID() }), post()]) {
    await error(await handler(request), 401, 'login_required');
  }
  for (const raw of ['', 'bad!header', Buffer.from(JSON.stringify({ user_id: A.user_id })).toString('base64url'),
    Buffer.from(JSON.stringify({ ...A, picture: '', site_id: 'site', host_id: 'host', session_expires_at: 1 })).toString('base64url')]) {
    await error(await handler(new Request(`${BASE}?action=me`, { headers: { 'x-qoder-user-context': raw } })), 403, 'invalid_user_context');
  }
  await error(await createHandler(storage, () => null)(get('list')), 401, 'login_required');
  await error(await createHandler(storage, () => { throw new Error(SECRET); })(get('me')), 403, 'invalid_user_context');
  assert.equal(storage.uploads.length + storage.downloads.length + storage.lists.length, 0);
});

test('cloud: copied SDK reads the documented context and returns only id/name', async () => {
  const storage = new FakeStorage();
  const raw = Buffer.from(JSON.stringify({
    ...A, picture: 'https://example.test/picture', site_id: 'site', host_id: 'host',
    session_expires_at: Math.floor(Date.now() / 1000) + 60, privateField: SECRET,
  })).toString('base64url');
  const result = await body(await createHandler(storage)(new Request(`${BASE}?action=me`, {
    headers: { 'x-qoder-user-context': raw },
  })));
  assert.deepEqual(result, { user: { id: A.user_id, name: A.name } });
});

test('cloud: account switches and missing expectedUserId fail before any storage access', async () => {
  const storage = new FakeStorage();
  let user = A;
  const handler = createHandler(storage, async () => user);
  assert.equal((await body(await handler(get('me')))).user.id, A.user_id);
  user = B;
  const id = randomUUID();
  for (const request of [get('list'), get('snapshot', A, { id }), post(id),
    new Request(`${BASE}?action=list`), new Request(`${BASE}?action=snapshot&id=${id}`),
    post(id, RECORDS, { expectedUserId: undefined }), post(id, RECORDS, { expectedUserId: 1 })]) {
    await error(await handler(request), 409, 'account_changed');
  }
  assert.equal((await body(await handler(get('me')))).user.id, B.user_id);
  assert.equal(storage.uploads.length + storage.downloads.length + storage.lists.length, 0);
});

test('cloud: unknown routes/methods do not expose a delete or overwrite API', async () => {
  const storage = new FakeStorage();
  const handler = createHandler(storage, () => A);
  for (const action of ['', 'delete', 'remove', 'signedUrl', 'unknown']) {
    await error(await handler(get(action)), 404, 'not_found');
  }
  for (const [action, method, allow] of [['me', 'POST', 'GET'], ['list', 'POST', 'GET'], ['snapshot', 'DELETE', 'GET, POST'], ['snapshot', 'PUT', 'GET, POST']]) {
    const response = await handler(new Request(`${BASE}?action=${action}`, { method }));
    assert.equal(response.headers.get('allow'), allow);
    await error(response, 405, 'method_not_allowed');
  }
  assert.equal(storage.uploads.length + storage.downloads.length + storage.lists.length, 0);
});

test('cloud: accepts gateway-rewritten same-origin requests and rejects explicit cross-site writes', async () => {
  const storage = new FakeStorage();
  const handler = createHandler(storage, () => A);
  for (const headers of [
    { 'sec-fetch-site': 'cross-site' },
    { origin: 'https://attacker.example' },
    { origin: 'null' },
    { 'sec-fetch-site': 'same-site', origin: 'https://other.arcade.example' },
    { 'sec-fetch-site': 'cross-site', origin: 'https://arcade.example' },
  ] as HeadersInit[]) await error(await handler(post(randomUUID(), RECORDS, {}, headers)), 403, 'invalid_origin');
  assert.equal(storage.uploads.length, 0);
  await body(await handler(post(randomUUID(), RECORDS, {}, { origin: 'https://arcade.example' })));
  await body(await handler(new Request('https://internal.provider.test/functions/v1/physical-name?action=snapshot', {
    method: 'POST', headers: { 'content-type': 'application/json', origin: 'https://arcade.example', 'sec-fetch-site': 'same-origin' },
    body: JSON.stringify({ id: randomUUID(), expectedUserId: A.user_id, records: RECORDS }),
  })));
});

test('cloud: validates MIME, JSON, UUIDv4 and non-empty approved game records', async () => {
  const storage = new FakeStorage();
  const handler = createHandler(storage, () => A);
  for (const type of ['text/plain', 'application/x-www-form-urlencoded', 'application/jsonp', '']) {
    await error(await handler(post(randomUUID(), RECORDS, {}, { 'content-type': type })), 415, 'unsupported_media_type');
  }
  for (const raw of ['', '{', 'null', '[]', '42']) {
    await error(await handler(new Request(`${BASE}?action=snapshot`, {
      method: 'POST', headers: { 'content-type': 'application/json' }, body: raw,
    })), 400, raw === '' || raw === '{' ? 'invalid_json' : 'invalid_snapshot');
  }
  for (const id of ['', '../escape', '11111111-1111-1111-8111-111111111111', '11111111-1111-4111-7111-111111111111']) {
    await error(await handler(post(id as `${string}-${string}-${string}-${string}-${string}`)), 400, 'invalid_id');
    await error(await handler(get('snapshot', A, { id })), 400, 'invalid_id');
  }
  for (const records of [{}, [], null, '42', { arbitrary: '1' }, { 'between-blocks-best': -1 },
    { 'between-blocks-best': '-1' }, { 'between-blocks-best': 'not json' }, { 'little-break-snake': '{}' },
    JSON.parse('{"__proto__":"1"}')]) {
    await error(await handler(post(randomUUID(), records)), 400, 'invalid_records');
  }
  await error(await handler(streamRequest([new Uint8Array([0xff, 0xfe])])), 400, 'invalid_json');
  assert.equal(storage.uploads.length, 0);
  await body(await handler(post(randomUUID(), RECORDS, {}, { 'content-type': 'Application/JSON; charset=UTF-8' })));
});

test('cloud: validates pagination offsets without trusting arbitrary path/prefix parameters', async () => {
  const storage = new FakeStorage();
  const handler = createHandler(storage, () => A);
  for (const offset of ['-1', '1.5', '1e2', '', 'NaN', 'Infinity', '9007199254740991', '../path']) {
    await error(await handler(get('list', A, { offset })), 400, 'invalid_offset');
  }
  assert.equal(storage.lists.length, 0);
  await body(await handler(get('list', A, { offset: '0', path: directory(B), prefix: 'users' })));
  assert.equal(storage.lists[0].path, directory(A));
});

test('cloud: streams without Content-Length, enforces actual envelope bytes and records boundary', async () => {
  const storage = new FakeStorage();
  const handler = createHandler(storage, () => A);
  const raw = new TextEncoder().encode(JSON.stringify({ id: randomUUID(), expectedUserId: A.user_id, records: RECORDS }));
  const request = streamRequest([raw.slice(0, 17), raw.slice(17)]);
  assert.equal(request.headers.get('content-length'), null);
  await body(await handler(request));
  for (const headers of [{}, { 'content-length': '1' }] as HeadersInit[]) {
    await error(await handler(streamRequest([new Uint8Array(LIMIT), new Uint8Array(1)], headers)), 413, 'payload_too_large');
  }
  await error(await handler(streamRequest([raw], { 'content-length': String(LIMIT + 1) })), 413, 'payload_too_large');
  const key = 'between-blocks-best';
  const overhead = new TextEncoder().encode(JSON.stringify({ [key]: '' })).length;
  const maxRecords = { [key]: '0' + ' '.repeat(MAX_BYTES - overhead - 1) };
  assert.equal(new TextEncoder().encode(JSON.stringify(maxRecords)).length, MAX_BYTES);
  await body(await handler(post(randomUUID(), maxRecords)));
  await error(await handler(post(randomUUID(), { [key]: maxRecords[key] + ' ' })), 400, 'invalid_records');
  const unicodeEnvelope = JSON.stringify({ id: randomUUID(), expectedUserId: A.user_id, records: RECORDS, unused: '界'.repeat(LIMIT / 2) });
  assert.ok(unicodeEnvelope.length < LIMIT);
  await error(await handler(streamRequest([new TextEncoder().encode(unicodeEnvelope)])), 413, 'payload_too_large');
  assert.equal(storage.uploads.length, 2);
});

test('cloud: a stalled body times out and cancels without waiting for cancellation', async context => {
  context.mock.timers.enable({ apis: ['setTimeout'] });
  const storage = new FakeStorage();
  let cancelled = false;
  const request = new Request(`${BASE}?action=snapshot`, {
    method: 'POST', headers: { 'content-type': 'application/json' }, duplex: 'half',
    body: new ReadableStream({ cancel() { cancelled = true; return new Promise<void>(() => {}); } }),
  } as RequestInit);
  const result = createHandler(storage, () => A)(request);
  await new Promise<void>(resolve => setImmediate(resolve));
  context.mock.timers.tick(15_000);
  await error(await result, 408, 'request_timeout');
  assert.equal(cancelled, true);
  assert.equal(storage.uploads.length, 0);
});

test('cloud: raw service arrays paginate by created_at, fetching only the first ten bodies', async () => {
  const storage = new FakeStorage();
  const handler = createHandler(storage, () => A);
  const ids: string[] = [];
  for (let i = 0; i < 23; i++) {
    const id = randomUUID();
    ids.push(id);
    await body(await handler(post(id)));
  }
  await body(await createHandler(storage, () => B)(post(randomUUID(), RECORDS, { expectedUserId: B.user_id })));
  storage.downloads = [];
  const all: string[] = [];
  for (const [offset, expectedSize, next] of [[0, 10, 10], [10, 10, 20], [20, 3, null]] as const) {
    const page = await body(await handler(get('list', A, { offset: String(offset) })));
    assert.equal(page.items.length, expectedSize);
    assert.equal(page.nextOffset, next);
    for (const summary of page.items) {
      assert.deepEqual(Object.keys(summary).sort(), ['createdAt', 'id', 'keys']);
      assert.deepEqual(summary.keys, Object.keys(RECORDS));
      assert.ok(Number.isFinite(Date.parse(summary.createdAt)));
      all.push(summary.id);
    }
    assert.equal(storage.downloads.length, Math.min(offset + expectedSize, 23));
    assert.deepEqual(storage.lists.at(-1), { path: directory(A), options: {
      limit: 11, offset, sortBy: { column: 'created_at', order: 'desc' },
    } });
  }
  assert.deepEqual(all, ids.reverse());
  assert.equal(new Set(all).size, 23);
  assert.deepEqual((await body(await handler(get('list', A, { offset: '99' })))).items, []);
});

test('cloud: an exact ten-item page ends; invalid entries cannot redirect downloads or leak records', async () => {
  const storage = new FakeStorage();
  const handler = createHandler(storage, () => A);
  for (let i = 0; i < 10; i++) storage.seed(A, randomUUID());
  const exact = await body(await handler(get('list')));
  assert.equal(exact.items.length, 10);
  assert.equal(exact.nextOffset, null);
  const valid = randomUUID();
  const foreign = randomUUID();
  const malformed = randomUUID();
  storage.seed(A, valid);
  storage.seed(A, foreign, { owner: B.user_id });
  storage.seed(A, malformed, { records: { 'between-blocks-best': '-1' } });
  storage.listingOverride = [
    { name: '../../escape.json' }, { name: `${directory(B)}/${valid}.json` }, { name: 'folder' }, null,
    { name: `${foreign}.json` }, { name: `${malformed}.json` }, { name: `${valid}.json`, owner: B.user_id, path: pathFor(B, valid) },
  ];
  storage.downloads = [];
  const page = await body(await handler(get('list')));
  assert.deepEqual(page.items, [{ id: valid, createdAt: '2026-09-01T00:00:00.000Z', keys: Object.keys(RECORDS) }]);
  assert.deepEqual(storage.downloads, [pathFor(A, foreign), pathFor(A, malformed), pathFor(A, valid)]);
});

test('cloud: upload committing before throw is reconciled once from actual bytes', async () => {
  const storage = new FakeStorage();
  storage.uploadMode = 'commit-then-throw';
  const id = randomUUID();
  const result = await body(await createHandler(storage, () => A)(post(id)));
  assert.equal(result.snapshot.id, id);
  assert.deepEqual(result.snapshot.records, RECORDS);
  assert.equal(storage.uploads.length, 1);
  assert.deepEqual(storage.downloads, [pathFor(A, id)]);
});

test('cloud: same UUID/same records reconciles; conflicting payload never overwrites old data', async () => {
  const storage = new FakeStorage();
  const handler = createHandler(storage, () => A);
  const id = randomUUID();
  storage.seed(A, id);
  const before = storage.objects.get(pathFor(A, id))!.bytes.slice();
  const equalReordered = { 'little-break-pacman-best-v1': '100', 'between-blocks-best': '42' };
  const existing = await body(await handler(post(id, equalReordered)));
  assert.equal(existing.snapshot.createdAt, '2026-09-01T00:00:00.000Z');
  await error(await handler(post(id, OTHER)), 409, 'snapshot_conflict');
  assert.deepEqual(storage.objects.get(pathFor(A, id))!.bytes, before);
  assert.equal(storage.uploads.length, 2);
  assert.ok(storage.uploads.every(call => call.options.upsert === false));
});

test('cloud: concurrent conflicting requests use immutable storage rather than check-then-overwrite', async () => {
  const storage = new FakeStorage();
  const handler = createHandler(storage, () => A);
  const id = randomUUID();
  const responses = await Promise.all([handler(post(id)), handler(post(id, OTHER))]);
  assert.deepEqual(responses.map(response => response.status).sort(), [200, 409]);
  const success = await body(responses.find(response => response.status === 200)!);
  await error(responses.find(response => response.status === 409)!, 409, 'snapshot_conflict');
  const stored = await body(await handler(get('snapshot', A, { id })));
  assert.deepEqual(stored.snapshot, success.snapshot);
  assert.equal(storage.objects.size, 1);
});

test('cloud: upload success is never confirmed without matching readback id, owner, schema and records', async () => {
  for (const transform of [
    (snapshot: CloudSnapshot) => ({ ...snapshot, owner: B.user_id }),
    (snapshot: CloudSnapshot) => ({ ...snapshot, id: randomUUID() }),
    (snapshot: CloudSnapshot) => ({ ...snapshot, records: OTHER }),
    (snapshot: CloudSnapshot) => ({ ...snapshot, version: 9 }),
    (snapshot: CloudSnapshot) => ({ ...snapshot, records: {} }),
  ]) {
    const storage = new FakeStorage();
    storage.transformUpload = transform;
    await error(await createHandler(storage, () => A)(post()), 503, 'write_result_unknown');
    assert.equal(storage.uploads.length, 1);
    assert.equal(storage.downloads.length, 1);
  }
  for (const uploadMode of ['throw', 'no-commit'] as const) {
    const storage = new FakeStorage();
    storage.uploadMode = uploadMode;
    await error(await createHandler(storage, () => A)(post()), 503, 'write_result_unknown');
    assert.equal(storage.uploads.length, 1);
    assert.equal(storage.downloads.length, 1);
  }
  const storage = new FakeStorage();
  storage.failDownload = true;
  await error(await createHandler(storage, () => A)(post()), 503, 'write_result_unknown');
  assert.equal(storage.objects.size, 1);
});

test('cloud: storage failures and unexpected listing envelopes never expose provider errors', async () => {
  const storage = new FakeStorage();
  const handler = createHandler(storage, () => A);
  storage.failList = true;
  await error(await handler(get('list')), 503, 'storage_unavailable');
  storage.failList = false;
  for (const result of [{ data: [], has_more: false }, { error: SECRET }, 'invalid']) {
    storage.listingOverride = result;
    await error(await handler(get('list')), 503, 'storage_unavailable');
  }
  storage.failDownload = true;
  await error(await handler(get('snapshot', A, { id: randomUUID() })), 503, 'storage_unavailable');
});

test('cloud: stored downloads are also bounded and schema checked, without upstream header passthrough', async () => {
  const storage = new FakeStorage();
  const handler = createHandler(storage, () => A);
  for (const response of [
    () => new Response(SECRET, { status: 503, headers: { 'x-provider-secret': SECRET } }),
    () => new Response('not json'),
    () => new Response(' '.repeat(LIMIT + 1)),
    () => new Response('{}'),
  ]) {
    storage.downloadOverride = response;
    await error(await handler(get('snapshot', A, { id: randomUUID() })), 503, 'storage_unavailable');
  }
});

test('cloud: storage waits time out safely and late downloads are cancelled', async context => {
  context.mock.timers.enable({ apis: ['setTimeout'] });
  const storage = new FakeStorage();
  let resolveDownload!: (response: Response) => void;
  let started!: () => void;
  const ready = new Promise<void>(resolve => { started = resolve; });
  storage.download = async () => { started(); return new Promise<Response>(resolve => { resolveDownload = resolve; }); };
  const pending = createHandler(storage, () => A)(get('snapshot', A, { id: randomUUID() }));
  await ready;
  await new Promise<void>(resolve => setImmediate(resolve));
  context.mock.timers.tick(15_000);
  await error(await pending, 503, 'storage_unavailable');
  let cancelled = false;
  resolveDownload(new Response(new ReadableStream({ cancel() { cancelled = true; } })));
  await new Promise<void>(resolve => setImmediate(resolve));
  assert.equal(cancelled, true);
});

test('cloud: deployment entry uses only injected storage and the real handler', () => {
  const index = readFileSync(new URL('../functions/index.ts', import.meta.url), 'utf8');
  assert.match(index, /import \{ storage \} from '\.\/_qoder\/storage\.mjs'/);
  assert.match(index, /Deno\.serve\(createHandler\(storage\)\)/);
  assert.ok(!index.includes('FakeStorage'));
});
