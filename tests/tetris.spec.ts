import { test, expect } from '@playwright/test';
import type { Page } from '@playwright/test';

const bestKey = 'between-blocks-best';

async function prepare(page: Page, installClock = true) {
  await page.addInitScript((key) => {
    // Keep the first piece rotatable and observe browser APIs, not Vue internals.
    Math.random = () => 1 - Number.EPSILON;
    const audit = { reads: 0, writes: [] as string[], events: 0, blockEvents: false, listeners: new Set<EventListenerOrEventListenerObject>() };
    const get = Storage.prototype.getItem;
    const set = Storage.prototype.setItem;
    Storage.prototype.getItem = function (name) {
      if (this === localStorage && name === key) audit.reads++;
      return get.call(this, name);
    };
    Storage.prototype.setItem = function (name, value) {
      if (this === localStorage && name === key) audit.writes.push(String(value));
      return set.call(this, name, value);
    };
    // Delay app delivery without replacing shared storage or browser-generated events.
    window.addEventListener('storage', (event) => {
      if (event.storageArea !== localStorage || (event.key !== key && event.key !== null)) return;
      if (event.isTrusted) audit.events++;
      if (audit.blockEvents) event.stopImmediatePropagation();
    }, true);
    const add = window.addEventListener.bind(window);
    const remove = window.removeEventListener.bind(window);
    window.addEventListener = (type: string, listener: EventListenerOrEventListenerObject, options?: boolean | AddEventListenerOptions) => {
      if (type === 'storage') audit.listeners.add(listener);
      add(type, listener, options);
    };
    window.removeEventListener = (type: string, listener: EventListenerOrEventListenerObject, options?: boolean | EventListenerOptions) => {
      if (type === 'storage') audit.listeners.delete(listener);
      remove(type, listener, options);
    };
    Object.defineProperty(window, '__tetrisStorageAudit', { value: audit });
  }, bestKey);
  if (installClock) {
    const epoch = new Date('2026-01-01T00:00:00Z');
    await page.clock.install({ time: epoch });
    await page.clock.pauseAt(new Date(epoch.getTime() + 1000));
  }
  await page.goto('/#/games/tetris');
  await expect(page.locator('#start-button')).toBeVisible();
}

async function board(page: Page) {
  return page.locator('#board').evaluate(canvas => (canvas as HTMLCanvasElement).toDataURL());
}

async function audit(page: Page) {
  return page.evaluate(() => {
    const value = Reflect.get(window, '__tetrisStorageAudit');
    return { reads: value.reads as number, writes: [...value.writes] as string[], events: value.events as number, listeners: value.listeners.size as number };
  });
}

async function storedBest(page: Page) {
  return page.evaluate(key => localStorage.getItem(key), bestKey);
}

async function position(page: Page) {
  return {
    board: await board(page),
    score: await page.locator('#score').textContent(),
    status: await page.locator('#status-label').textContent(),
    lines: await page.locator('#lines').textContent(),
    hold: await page.locator('#hold').evaluate(canvas => (canvas as HTMLCanvasElement).toDataURL()),
  };
}

test('暂存后每 200ms 再按 C 持续五秒仍正常重力下落', async ({ page }) => {
  await prepare(page);
  await page.locator('#start-button').click();
  await page.keyboard.press('c');
  await expect(page.locator('#hold-hint')).toBeHidden();
  const before = await board(page);
  const held = await page.locator('#hold').evaluate(canvas => (canvas as HTMLCanvasElement).toDataURL());
  for (let i = 0; i < 25; i++) {
    await page.clock.runFor(200);
    await page.keyboard.press('c');
  }
  expect(await board(page) === before, '无效暂存不能阻止棋盘重力更新').toBe(false);
  expect(await page.locator('#hold').evaluate(canvas => (canvas as HTMLCanvasElement).toDataURL())).toBe(held);
  await expect(page.locator('#score')).toHaveText('000000');
  await expect(page.locator('#status-label')).toHaveText('游戏进行中');
});

for (const key of ['c', 'ArrowDown', 'Space']) {
  test(`有效 ${key} 操作仍重置重力间隔`, async ({ page }) => {
    await prepare(page);
    await page.locator('#start-button').click();
    await page.clock.runFor(700);
    await page.keyboard.press(key);
    const afterAction = await board(page);
    await page.clock.runFor(300);
    expect(await board(page) === afterAction).toBe(true);
    await page.clock.runFor(600);
    expect(await board(page) === afterAction).toBe(false);
  });
}

test.describe('1024px 宽屏触屏', () => {
  test.use({ viewport: { width: 1024, height: 768 }, hasTouch: true, isMobile: false });

  test('无需键盘即可左右移动、旋转、软降和硬降', async ({ page }) => {
    await prepare(page);
    expect(await page.evaluate(() => matchMedia('(any-pointer: coarse)').matches)).toBe(true);
    await expect(page.locator('.touch-controls button')).toHaveCount(6);
    for (const button of await page.locator('.touch-controls button').all()) await expect(button).toBeVisible();
    await page.locator('#start-button').tap();
    const initial = await board(page);
    await page.getByRole('button', { name: '向左移动', exact: true }).tap();
    expect(await board(page) === initial).toBe(false);
    await page.getByRole('button', { name: '向右移动', exact: true }).tap();
    expect(await board(page) === initial).toBe(true);
    await page.getByRole('button', { name: '旋转方块', exact: true }).tap();
    expect(await board(page) === initial).toBe(false);
    await page.getByRole('button', { name: '加速下落', exact: true }).tap();
    await expect(page.locator('#score')).toHaveText('000001');
    const softDrop = await board(page);
    await page.getByRole('button', { name: '直接落底', exact: true }).tap();
    expect(await board(page) === softDrop).toBe(false);
    expect(Number(await page.locator('#score').textContent())).toBeGreaterThan(1);
    await expect(page.locator('#status-label')).toHaveText('游戏进行中');
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  });
});

test('同 context 两页实时同步最高分，不改局面、不回写，低分不覆盖', async ({ page, context }) => {
  await prepare(page);
  const other = await context.newPage();
  await prepare(other, false);
  await other.locator('#start-button').click();
  await other.keyboard.press('c');
  await other.keyboard.press('ArrowDown');
  await other.locator('#pause-button').click();
  await expect(page.locator('#best-score')).toHaveText('1');
  const before = await position(other);
  const writes = (await audit(other)).writes;
  await page.locator('#start-button').click();
  await page.keyboard.press('Space');
  const high = Number(await page.locator('#score').textContent());
  await expect(other.locator('#best-score')).toHaveText(high.toLocaleString());
  expect(await position(other)).toEqual(before);
  expect((await audit(other)).writes).toEqual(writes);
  expect((await audit(other)).events).toBeGreaterThan(0);
  await other.locator('#start-button').click();
  await other.keyboard.press('ArrowDown');
  await expect(other.locator('#score')).toHaveText('000002');
  expect(await storedBest(other)).toBe(String(high));
  expect((await audit(other)).writes).toEqual(writes);
  await other.reload();
  await expect(other.locator('#best-score')).toHaveText(high.toLocaleString());
});

test('尚未处理跨页 storage 事件时，破本页纪录也先合并最新最高分', async ({ page, context }) => {
  await prepare(page);
  const other = await context.newPage();
  await prepare(other, false);
  await other.evaluate(() => { Reflect.get(window, '__tetrisStorageAudit').blockEvents = true; });
  await page.locator('#start-button').click();
  await page.keyboard.press('Space');
  const high = Number(await page.locator('#score').textContent());
  await expect.poll(async () => (await audit(other)).events).toBeGreaterThan(0);
  await expect(other.locator('#best-score')).toHaveText('0');
  expect(await storedBest(other)).toBe(String(high));
  await other.locator('#start-button').click();
  await other.keyboard.press('ArrowDown');
  await expect(other.locator('#score')).toHaveText('000001');
  expect(await storedBest(other), '本页过期的 best 不得覆盖另一页的新纪录').toBe(String(high));
  await expect(other.locator('#best-score')).toHaveText(high.toLocaleString());
  expect((await audit(other)).writes.every(value => Number(value) >= high)).toBe(true);
});

test('storage 同步沿用有限非负数约束，删除或无效值不降低已有纪录', async ({ page, context }) => {
  await prepare(page);
  const other = await context.newPage();
  await other.goto('/');
  for (const value of ['Infinity', 'NaN', '-12', '7.5', 'invalid', '2']) {
    const events = (await audit(page)).events;
    await other.evaluate(({ key, value }) => localStorage.setItem(key, value), { key: bestKey, value });
    await expect.poll(async () => (await audit(page)).events).toBeGreaterThan(events);
    await expect(page.locator('#best-score')).toHaveText(['Infinity', 'NaN', '-12'].includes(value) ? '0' : '7.5');
  }
  const events = (await audit(page)).events;
  await other.evaluate(() => localStorage.clear());
  await expect.poll(async () => (await audit(page)).events).toBeGreaterThan(events);
  await expect(page.locator('#best-score')).toHaveText('7.5');
  expect((await audit(page)).writes).toEqual([]);
  await expect(page.locator('#status-label')).toHaveText('准备就绪');
});

test('正常重力不轮询存储，离开移除 storage 监听，返回重新读取', async ({ page, context }) => {
  await prepare(page);
  const mounted = await audit(page);
  expect(mounted.listeners).toBe(1);
  await page.locator('#start-button').click();
  await page.clock.runFor(5000);
  expect((await audit(page)).reads).toBe(mounted.reads);
  await page.getByRole('link', { name: '返回大厅', exact: true }).click();
  await expect(page.locator('.lobby')).toBeVisible();
  const removed = await audit(page);
  expect(removed.listeners).toBe(0);
  const other = await context.newPage();
  await other.goto('/');
  await other.evaluate(key => localStorage.setItem(key, '123'), bestKey);
  await expect.poll(async () => (await audit(page)).events).toBeGreaterThan(removed.events);
  expect((await audit(page)).reads).toBe(removed.reads);
  expect((await audit(page)).writes).toEqual(removed.writes);
  await page.getByRole('link', { name: '开始玩俄罗斯方块', exact: true }).click();
  await expect(page.locator('#best-score')).toHaveText('123');
  await expect(page.locator('#score')).toHaveText('000000');
  expect((await audit(page)).listeners).toBe(1);
});

test('存储读取和写入失败时仍可得分及更新本页最高分', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  await prepare(page);
  await page.evaluate(() => {
    Storage.prototype.getItem = () => { throw new DOMException('Storage blocked', 'SecurityError'); };
    Storage.prototype.setItem = () => { throw new DOMException('Storage blocked', 'SecurityError'); };
  });
  await page.locator('#start-button').click();
  await page.keyboard.press('ArrowDown');
  await expect(page.locator('#score')).toHaveText('000001');
  await expect(page.locator('#best-score')).toHaveText('1');
  expect(errors).toEqual([]);
});
