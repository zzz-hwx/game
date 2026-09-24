<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref } from 'vue';
import { RouterLink } from 'vue-router';
import { isObject, parseSnapshot, RECORD_LABELS, validId } from '../../functions/data';
import type { CloudSnapshot, RecordKey, SnapshotSummary } from '../../functions/data';
import { ApiError, isWriteOutcomeUnknown, requestJson } from '../data/api';
import { collectRecords, RECOVERY_KEY, restoreRecords, undoRestore } from '../data/local';

type User = { id: string; name: string };
type Pending = { id: string; owner: string; fingerprint: string };
const endpoint = '/functions/v1/app';
const user = ref<User | null>(null);
const items = ref<SnapshotSummary[]>([]);
const localKeys = ref<RecordKey[]>([]);
const localError = ref('');
const error = ref('');
const status = ref('');
const busy = ref(false);
const unauthorized = ref(false);
const nextOffset = ref<number | null>(null);
const pending = ref<Pending | null>(null);
const canUndo = ref(false);
const dialog = ref<HTMLDialogElement | null>(null);
const cancelButton = ref<HTMLButtonElement | null>(null);
const action = ref<'save' | 'restore' | 'undo' | 'abandon' | null>(null);
const selected = ref<CloudSnapshot | null>(null);
const localBaseline = ref('');
let active = true;
const actionTitle = computed(() => ({ save: '保存本机数据到云端？', restore: '恢复这份云端备份？', undo: '撤销上次恢复？', abandon: '放弃确认本次保存？' }[action.value ?? 'save']));
const summary = (keys: RecordKey[]) => keys.map(key => RECORD_LABELS[key]).join('、');
const timestamp = (value: string) => new Date(value).toLocaleString('zh-CN');
const pendingKey = (id: string) => `little-break-cloud-pending:${id}`;

function parseUser(value: unknown): User {
  if (!isObject(value) || !isObject(value.user) || typeof value.user.id !== 'string' || !value.user.id || typeof value.user.name !== 'string') {
    throw new ApiError('账号信息无法读取，请刷新重试。', 'invalid_response');
  }
  return { id: value.user.id, name: value.user.name };
}
function sameUser(value: unknown, expected: string): void {
  if (parseUser(value).id !== expected) throw new ApiError('账号已变化，请刷新后重试。', 'account_changed', 409);
}
function fail(cause: unknown): void {
  error.value = cause instanceof Error ? cause.message : '操作未完成，请重试。';
  if (cause instanceof ApiError && ([401, 403].includes(cause.status) || cause.code === 'account_changed')) {
    user.value = null;
    items.value = [];
    selected.value = null;
    unauthorized.value = cause.status === 401;
  }
}
function refreshLocal(): void {
  localError.value = '';
  try {
    canUndo.value = localStorage.getItem(RECOVERY_KEY) !== null;
    localKeys.value = Object.keys(collectRecords(localStorage)) as RecordKey[];
  } catch {
    localKeys.value = [];
    localError.value = '本机存储不可用或有损坏的游戏记录，暂不能上传。现有数据不会被删除。';
  }
}
function localState(): string {
  return JSON.stringify(Object.keys(RECORD_LABELS).map(key => localStorage.getItem(key)));
}
async function fingerprint(records: CloudSnapshot['records']): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(JSON.stringify(records)));
  return Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, '0')).join('');
}
async function listMore(offset: number): Promise<void> {
  const expected = user.value?.id;
  if (!expected) return;
  const value = await requestJson(`${endpoint}?action=list&offset=${offset}&expectedUserId=${encodeURIComponent(expected)}`);
  if (!active) return;
  sameUser(value, expected);
  if (!isObject(value) || !Array.isArray(value.items) || !(value.nextOffset === null || (Number.isSafeInteger(value.nextOffset) && Number(value.nextOffset) > offset))) {
    throw new ApiError('云存档列表无法解析。', 'invalid_response');
  }
  const parsed = value.items.map((item: unknown): SnapshotSummary => {
    if (!isObject(item) || !validId(item.id) || typeof item.createdAt !== 'string' || !Number.isFinite(Date.parse(item.createdAt))
      || !Array.isArray(item.keys) || !item.keys.every(key => typeof key === 'string' && Object.hasOwn(RECORD_LABELS, key))) {
      throw new ApiError('云存档列表无法解析。', 'invalid_response');
    }
    return { id: item.id, createdAt: item.createdAt, keys: item.keys as RecordKey[] };
  });
  items.value = offset === 0 ? parsed : [...items.value, ...parsed.filter(item => !items.value.some(previous => previous.id === item.id))];
  nextOffset.value = value.nextOffset as number | null;
}
async function run(work: () => Promise<void>): Promise<void> {
  if (busy.value) return;
  busy.value = true;
  error.value = '';
  status.value = '';
  try { await work(); }
  catch (cause) { if (active) fail(cause); }
  finally { if (active) busy.value = false; }
}
async function load(): Promise<void> {
  await run(async () => {
    refreshLocal();
    const value = await requestJson(`${endpoint}?action=me`);
    if (!active) return;
    user.value = parseUser(value);
    unauthorized.value = false;
    const raw = sessionStorage.getItem(pendingKey(user.value.id));
    pending.value = null;
    if (raw) {
      const saved = JSON.parse(raw);
      if (!validId(saved?.id) || saved.owner !== user.value.id || typeof saved.fingerprint !== 'string') throw new Error('本次保存的确认信息已损坏，请关闭此标签页再重新打开。');
      pending.value = saved;
    }
    await listMore(0);
  });
}
async function fetchSnapshot(id: string, expected: string): Promise<CloudSnapshot> {
  const value = await requestJson(`${endpoint}?action=snapshot&id=${encodeURIComponent(id)}&expectedUserId=${encodeURIComponent(expected)}`);
  sameUser(value, expected);
  const snapshot = parseSnapshot(isObject(value) ? value.snapshot : null);
  if (snapshot.owner !== expected || snapshot.id !== id) throw new ApiError('云存档所属账号不匹配。', 'invalid_response');
  return snapshot;
}
function clearPending(owner: string): void {
  sessionStorage.removeItem(pendingKey(owner));
  pending.value = null;
}
async function verifyPending(): Promise<void> {
  await run(async () => {
    const current = pending.value;
    if (!current || user.value?.id !== current.owner) return;
    const snapshot = await fetchSnapshot(current.id, current.owner);
    if (!active) return;
    if (await fingerprint(snapshot.records) !== current.fingerprint) throw new Error('云端内容与本次保存不一致，未覆盖任何数据。');
    clearPending(current.owner);
    status.value = '已确认本次数据保存到云端。';
    await listMore(0);
  });
}
function openDialog(next: NonNullable<typeof action.value>): void {
  action.value = next;
  dialog.value?.showModal();
  void nextTick(() => cancelButton.value?.focus());
}
async function chooseRestore(id: string): Promise<void> {
  await run(async () => {
    if (!user.value) return;
    const snapshot = await fetchSnapshot(id, user.value.id);
    if (!active) return;
    selected.value = snapshot;
    localBaseline.value = localState();
    openDialog('restore');
  });
}
async function save(): Promise<void> {
  const expected = user.value?.id;
  if (!expected || pending.value) return;
  const records = collectRecords(localStorage);
  if (!Object.keys(records).length) throw new Error('本机还没有游戏记录，先去玩一会吧。');
  const current: Pending = { id: crypto.randomUUID(), owner: expected, fingerprint: await fingerprint(records) };
  sessionStorage.setItem(pendingKey(expected), JSON.stringify(current));
  pending.value = current;
  try {
    const value = await requestJson(`${endpoint}?action=snapshot`, {
      method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ id: current.id, expectedUserId: expected, records }),
    });
    sameUser(value, expected);
    const snapshot = parseSnapshot(isObject(value) ? value.snapshot : null);
    if (snapshot.id !== current.id || snapshot.owner !== expected || await fingerprint(snapshot.records) !== current.fingerprint) {
      throw new ApiError('保存结果需重新确认。', 'invalid_response');
    }
    clearPending(expected);
    if (!active) return;
    status.value = '已保存到云端。其他设备登录同一账号后，可在这里恢复。';
  } catch (cause) {
    if (!isWriteOutcomeUnknown(cause)) clearPending(expected);
    throw cause;
  }
  await listMore(0);
}
async function confirmAction(): Promise<void> {
  const next = action.value;
  dialog.value?.close();
  action.value = null;
  await run(async () => {
    if (next === 'save') await save();
    if (next === 'restore' && selected.value && user.value) {
      const snapshot = await fetchSnapshot(selected.value.id, user.value.id);
      if (!active) return;
      if (localState() !== localBaseline.value) throw new Error('确认期间本机游戏数据发生了变化，请关闭其他游戏标签页后重新选择备份。');
      restoreRecords(localStorage, snapshot.records);
      refreshLocal();
      status.value = '已恢复到本机，重新进入对应游戏即可继续。可随时撤销这次恢复。';
    }
    if (next === 'undo') {
      undoRestore(localStorage);
      refreshLocal();
      status.value = '已还原上次恢复前的本机数据，云端备份未改变。';
    }
    if (next === 'abandon' && pending.value) {
      clearPending(pending.value.owner);
      status.value = '已放弃确认。原备份可能已保存，可刷新云存档列表检查。';
    }
  });
  refreshLocal();
}
onMounted(() => { void load(); });
onBeforeUnmount(() => { active = false; });
</script>

<template>
  <main class="cloud-page">
    <div class="cloud-heading">
      <p class="cloud-eyebrow">MY LITTLE SAVE BOX</p>
      <h1>我的云存档</h1>
      <p>把游戏里的小成就带走，换一台设备也能接着玩。</p>
    </div>
    <section class="cloud-account" aria-labelledby="account-title">
      <div><h2 id="account-title">{{ user ? (user.name || '已登录 Qoder 账号') : 'Qoder 账号' }}</h2><p>{{ user ? '云端备份跟随当前账号，不会自动覆盖本机数据。' : '登录后保存和恢复云端备份；不登录也可以继续本机游戏。' }}</p></div>
      <a v-if="unauthorized" class="cloud-button primary" href="/__qoder_auth/start?return_path=%2F%23%2Fcloud">登录 Qoder</a>
      <button class="cloud-button" :disabled="busy" @click="load">刷新账号与存档</button>
    </section>
    <p v-if="busy && !status" role="status" class="cloud-message">正在处理，请稍候…</p>
    <p v-if="error" role="alert" class="cloud-message cloud-error">{{ error }}</p>
    <p v-if="status" role="status" class="cloud-message cloud-success">{{ status }}</p>
    <section v-if="pending" class="cloud-pending" aria-label="等待确认的保存">
      <p>有一次保存尚未确认。先读取云端结果，避免重复上传；刷新页面后仍可继续确认。</p>
      <button class="cloud-button" :disabled="busy || !user || pending.owner !== user.id" @click="verifyPending">检查保存结果</button>
      <button class="cloud-button" :disabled="busy" @click="openDialog('abandon')">放弃本次确认</button>
    </section>
    <div class="cloud-columns">
      <section class="cloud-panel" aria-labelledby="local-title">
        <p class="cloud-eyebrow">ON THIS DEVICE</p>
        <h2 id="local-title">本机游戏数据 <span>{{ localKeys.length }} 项</span></h2>
        <p>手动保存一个新版本，已有云端备份保持不变。</p>
        <p v-if="localError" role="alert" class="cloud-error">{{ localError }}</p>
        <ul v-else-if="localKeys.length" class="cloud-local-list"><li v-for="key in localKeys" :key="key">{{ RECORD_LABELS[key] }}</li></ul>
        <p v-else class="cloud-empty">还没有本机记录。先去大厅选个游戏吧。</p>
        <button class="cloud-button primary" :disabled="busy || !user || !!pending || !!localError || !localKeys.length" @click="openDialog('save')">保存到云端</button>
        <button v-if="canUndo" class="cloud-button" :disabled="busy" @click="openDialog('undo')">撤销上次恢复</button>
        <div class="cloud-note">只保存游戏已支持的记录：最高分、最佳用时、贪吃蛇设置、推箱子关卡和 2048 进度及存档。其他游戏未结束的对局、五子棋和翻牌配对的临时状态不在备份内。单份备份上限 512 KB。</div>
      </section>
      <section class="cloud-panel" aria-labelledby="saves-title">
        <p class="cloud-eyebrow">SAVED FOR LATER</p>
        <h2 id="saves-title">云端备份</h2>
        <p>在另一台设备打开本站并登录同一账号，再选择恢复。</p>
        <p v-if="!user" class="cloud-empty">登录并连接云服务后，备份会显示在这里。</p>
        <p v-else-if="!items.length && !busy && !error" class="cloud-empty">云端还没有备份，保存第一份小成就吧。</p>
        <ul class="cloud-saves">
          <li v-for="item in items" :key="item.id">
            <div><h3><time :datetime="item.createdAt">{{ timestamp(item.createdAt) }}</time></h3><p>{{ item.keys.length }} 项 · {{ summary(item.keys) }}</p></div>
            <button class="cloud-button" :disabled="busy" :aria-label="`恢复 ${timestamp(item.createdAt)} 的备份`" @click="chooseRestore(item.id)">恢复</button>
          </li>
        </ul>
        <button v-if="nextOffset !== null" class="cloud-button" :disabled="busy" @click="run(() => listMore(nextOffset!))">加载更多备份</button>
      </section>
    </div>
    <p class="cloud-footer">本机数据属于当前浏览器，不随账号自动切换。共用设备时，请确认只上传你自己的记录。 <RouterLink to="/">返回游戏大厅</RouterLink></p>
    <dialog ref="dialog" class="cloud-dialog" aria-labelledby="cloud-dialog-title" @cancel="action = null">
      <h2 id="cloud-dialog-title">{{ actionTitle }}</h2>
      <p v-if="action === 'save'">将本机已有游戏数据复制到当前账号的私有云端空间，不覆盖已有版本。请确认这些记录是你自己的。</p>
      <template v-else-if="action === 'restore'"><p>仅替换这份备份包含的游戏记录，其他游戏保持不变。恢复前的本机数据会保留，可通过“撤销上次恢复”找回。</p><p class="cloud-error">请先关闭其他正在游戏的标签页，避免它们覆盖恢复后的记录。</p></template>
      <p v-else-if="action === 'undo'">还原上次恢复前的本机数据。这些游戏在恢复后新增的本机记录将被替换，云端备份不受影响。请先关闭其他游戏标签页。</p>
      <p v-else>这不会取消已经送达云端的保存。原备份可能已存在，再次上传会产生新版本，不会覆盖它。</p>
      <div class="cloud-dialog-actions"><button ref="cancelButton" class="cloud-button" @click="dialog?.close(); action = null">取消</button><button class="cloud-button primary" @click="confirmAction">确认</button></div>
    </dialog>
  </main>
</template>

<style scoped>
.cloud-page { max-width: 1150px; margin: 0 auto; padding: 42px 30px; }
.cloud-heading { margin-bottom: 28px; }
.cloud-heading h1 { font-size: 32px; margin: 8px 0 12px; }
.cloud-page p { line-height: 1.8; color: #6a7861; font-size: 14px; }
.cloud-eyebrow { font: 10px Consolas, monospace !important; letter-spacing: 2px; color: #84936f !important; }
.cloud-account { display: flex; flex-wrap: wrap; align-items: center; gap: 14px; border: 1px solid #d8e1cb; border-radius: 14px; padding: 22px; background: #eaf0df; }
.cloud-account > div { flex: 1; min-width: 200px; }
.cloud-account h2 { font-size: 18px; margin: 0; overflow-wrap: anywhere; }
.cloud-account p { margin: 6px 0 0; }
.cloud-button { display: inline-flex; align-items: center; justify-content: center; min-height: 44px; border: 1px solid #cbd6bd; background: #fafbf5; border-radius: 8px; color: #3e5e36; font-size: 13px; padding: 10px 15px; text-decoration: none; }
.cloud-button:hover:not(:disabled) { background: #e2ebd5; }
.cloud-button.primary { background: #3c633e; color: white; border-color: #3c633e; }
.cloud-button.primary:hover:not(:disabled) { background: #2f5231; }
.cloud-button:disabled { opacity: .5; }
.cloud-columns { display: grid; grid-template-columns: minmax(0, 1fr) minmax(0, 1.3fr); gap: 24px; margin: 24px 0; }
.cloud-panel { border: 1px solid #dfe3d6; border-radius: 14px; background: #fdfdf8; padding: 26px; }
.cloud-panel h2 { font-size: 20px; margin: 12px 0; }
.cloud-panel h2 span { font-size: 12px; font-weight: normal; color: #788968; margin-left: 8px; }
.cloud-panel > .cloud-button { margin: 6px 8px 6px 0; }
.cloud-local-list { padding: 0; list-style: none; margin: 22px 0; display: flex; flex-wrap: wrap; gap: 8px; }
.cloud-local-list li { background: #edf1e3; padding: 8px 10px; border-radius: 6px; font-size: 12px; color: #526848; }
.cloud-note { font-size: 12px; line-height: 1.9; color: #7c866f; margin-top: 20px; }
.cloud-empty { padding: 24px 0; }
.cloud-saves { list-style: none; padding: 0; margin: 0; }
.cloud-saves li { display: flex; align-items: center; gap: 16px; padding: 20px 0; border-top: 1px solid #e4e9db; }
.cloud-saves li > div { flex: 1; min-width: 0; }
.cloud-saves h3 { font-size: 14px; margin: 0; }
.cloud-saves p { margin: 8px 0 0; font-size: 12px; overflow-wrap: anywhere; }
.cloud-saves .cloud-button { flex-shrink: 0; }
.cloud-message, .cloud-pending { padding: 14px 18px; border-radius: 8px; background: #eaf0df; }
.cloud-error { color: #964d3f !important; }
.cloud-message.cloud-error, .cloud-pending { background: #f7eddf; }
.cloud-success { color: #365c38 !important; }
.cloud-pending .cloud-button { margin-right: 8px; }
.cloud-footer { font-size: 12px !important; }
.cloud-footer a { white-space: nowrap; }
.cloud-dialog { max-width: 460px; width: calc(100% - 36px); border: 1px solid #d9e2ce; border-radius: 16px; background: #fdfdf8; color: #293e2e; padding: 26px; }
.cloud-dialog::backdrop { background: #17291366; }
.cloud-dialog h2 { font-size: 20px; margin: 0 0 14px; }
.cloud-dialog-actions { display: flex; justify-content: flex-end; gap: 12px; margin-top: 24px; }
@media (max-width: 760px) { .cloud-page { padding: 28px 18px; } .cloud-columns { grid-template-columns: 1fr; gap: 18px; } .cloud-panel { padding: 22px; } .cloud-heading h1 { font-size: 28px; } .cloud-account { padding: 20px; } }
</style>
