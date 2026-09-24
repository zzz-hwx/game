import { test, expect } from '@playwright/test';
import type { BrowserContext } from '@playwright/test';
import type { CloudSnapshot, GameRecords } from '../functions/data';

function fixture() {
  const snapshots = new Map<string, CloudSnapshot>();
  const state = { owner: 'test-A', anonymous: false, loseResponse: false, writes: 0 };
  async function attach(context: BrowserContext) {
    await context.route('**/functions/v1/app?*', async route => {
      const url = new URL(route.request().url());
      const action = url.searchParams.get('action');
      const user = { id: state.owner, name: `测试账号 ${state.owner}` };
      const send = (value: unknown, status = 200) => route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(value) });
      if (state.anonymous) return send({ error: 'login_required' }, 401);
      if (action === 'me') return send({ user });
      const body = route.request().method() === 'POST' ? route.request().postDataJSON() : null;
      if ((body?.expectedUserId ?? url.searchParams.get('expectedUserId')) !== state.owner) return send({ error: 'account_changed' }, 409);
      if (action === 'list') return send({ user, items: [...snapshots.values()].filter(s => s.owner === state.owner).map(s => ({ id: s.id, createdAt: s.createdAt, keys: Object.keys(s.records) })), nextOffset: null });
      if (body) {
        state.writes++;
        const snapshot: CloudSnapshot = { version: 1, id: body.id, owner: state.owner, createdAt: new Date().toISOString(), records: body.records as GameRecords };
        snapshots.set(snapshot.id, snapshot);
        if (state.loseResponse) return route.abort('failed');
        return send({ user, snapshot });
      }
      const snapshot = snapshots.get(url.searchParams.get('id') ?? '');
      if (!snapshot || snapshot.owner !== state.owner) return send({ error: 'storage_unavailable' }, 503);
      return send({ user, snapshot });
    });
  }
  return { snapshots, state, attach };
}

test('从游戏保存云备份，在另一浏览器恢复并撤销，刷新后记录仍在', async ({ page, context, browser }, testInfo) => {
  const cloud = fixture();
  await cloud.attach(context);
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto('/#/games/2048');
  await page.locator('.number-board').focus();
  await page.keyboard.press('ArrowLeft');
  await page.keyboard.press('ArrowDown');
  const original = await page.evaluate(() => localStorage.getItem('little-break-2048'));
  await page.getByRole('link', { name: '云存档', exact: true }).click();
  await expect(page.getByRole('heading', { name: '我的云存档' })).toBeVisible();
  await expect(page.getByRole('button', { name: '保存到云端' })).toBeEnabled();
  await page.getByRole('button', { name: '保存到云端' }).click();
  await expect(page.getByRole('dialog')).toBeVisible();
  await page.getByRole('button', { name: '确认', exact: true }).click();
  await expect(page.getByRole('status')).toContainText('已保存到云端');
  expect(cloud.state.writes).toBe(1);
  await page.screenshot({ path: testInfo.outputPath('cloud-saves.png'), fullPage: true });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  const second = await browser.newContext();
  await cloud.attach(second);
  const device = await second.newPage();
  try {
    await device.goto('/#/cloud');
    await expect(device.getByRole('button', { name: /^恢复 / })).toBeVisible();
    await device.getByRole('button', { name: /^恢复 / }).click();
    await device.getByRole('button', { name: '取消', exact: true }).click();
    expect(await device.evaluate(() => localStorage.getItem('little-break-2048'))).toBeNull();
    await device.getByRole('button', { name: /^恢复 / }).click();
    await device.getByRole('button', { name: '确认', exact: true }).click();
    await expect(device.getByRole('status')).toContainText('已恢复到本机');
    expect(await device.evaluate(() => localStorage.getItem('little-break-2048'))).toBe(original);
    await device.reload();
    await expect(device.getByRole('button', { name: '撤销上次恢复' })).toBeVisible();
    await device.getByRole('button', { name: '撤销上次恢复' }).click();
    await device.getByRole('button', { name: '确认', exact: true }).click();
    await expect(device.getByRole('status')).toContainText('已还原');
    expect(await device.evaluate(() => localStorage.getItem('little-break-2048'))).toBeNull();
  } finally { await second.close(); }
  expect(errors).toEqual([]);
});

test('未登录和云服务不可用不影响游客游戏', async ({ page, context }) => {
  const cloud = fixture();
  cloud.state.anonymous = true;
  await cloud.attach(context);
  await page.goto('/#/cloud');
  await expect(page.getByRole('link', { name: '登录 Qoder' })).toBeVisible();
  await expect(page.getByRole('button', { name: '保存到云端' })).toBeDisabled();
  await page.getByRole('link', { name: '返回游戏大厅' }).click();
  await page.getByRole('link', { name: '开始玩2048', exact: true }).click();
  await expect(page.locator('.board-cell')).toHaveCount(16);
});

test('损坏的本机数据不会被上传或删除', async ({ page, context }) => {
  const cloud = fixture();
  await cloud.attach(context);
  await page.goto('/');
  await page.evaluate(() => localStorage.setItem('little-break-2048', '{broken'));
  await page.getByRole('link', { name: '云存档', exact: true }).click();
  await expect(page.getByText('本机存储不可用或有损坏的游戏记录，暂不能上传。现有数据不会被删除。')).toBeVisible();
  await expect(page.getByRole('button', { name: '保存到云端' })).toBeDisabled();
  expect(cloud.state.writes).toBe(0);
  expect(await page.evaluate(() => localStorage.getItem('little-break-2048'))).toBe('{broken');
});

test('保存响应丢失后只读取确认，刷新页面也不会重复上传', async ({ page, context }) => {
  const cloud = fixture();
  cloud.state.loseResponse = true;
  await cloud.attach(context);
  await page.goto('/');
  await page.evaluate(() => localStorage.setItem('between-blocks-best', '88'));
  await page.getByRole('link', { name: '云存档', exact: true }).click();
  await page.getByRole('button', { name: '保存到云端' }).click();
  await page.getByRole('button', { name: '确认', exact: true }).click();
  await expect(page.getByRole('button', { name: '检查保存结果' })).toBeEnabled();
  await expect(page.getByRole('button', { name: '保存到云端' })).toBeDisabled();
  await page.reload();
  await page.getByRole('button', { name: '检查保存结果' }).click();
  await expect(page.getByRole('status')).toContainText('已确认本次数据保存到云端');
  expect(cloud.state.writes).toBe(1);
  await expect(page.getByRole('button', { name: '保存到云端' })).toBeEnabled();
});

test('账号在确认期间变化时拒绝上传旧账号数据', async ({ page, context }) => {
  const cloud = fixture();
  await cloud.attach(context);
  await page.goto('/');
  await page.evaluate(() => localStorage.setItem('between-blocks-best', '88'));
  await page.getByRole('link', { name: '云存档', exact: true }).click();
  await page.getByRole('button', { name: '保存到云端' }).click();
  cloud.state.owner = 'test-B';
  await page.getByRole('button', { name: '确认', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText('账号已变化');
  expect(cloud.state.writes).toBe(0);
  await page.getByRole('button', { name: '刷新账号与存档' }).click();
  await expect(page.getByRole('heading', { name: '测试账号 test-B' })).toBeVisible();
  expect(cloud.snapshots.size).toBe(0);
});
