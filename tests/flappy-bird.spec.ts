import { test, expect } from '@playwright/test';
import type { Page } from '@playwright/test';

const boardSelector = '.flappy-board';

async function trackFrames(page: Page) {
  return page.locator(`${boardSelector} canvas`).evaluateHandle(canvas => {
    const context = (canvas as HTMLCanvasElement).getContext('2d')!;
    const counts = { frames: 0, birdY: 0 };
    const fillRect = context.fillRect;
    const translate = context.translate;
    // Count full background paints, not pipe or ground rectangles.
    context.fillRect = function (...args) {
      if (args[0] === 0 && args[1] === 0 && args[2] === 420 && args[3] === 560) counts.frames++;
      fillRect.apply(this, args);
    };
    context.translate = function (x, y) {
      if (x === 112) counts.birdY = y;
      translate.call(this, x, y);
    };
    return counts;
  });
}

async function expectNoFrames(page: Page, counts: Awaited<ReturnType<typeof trackFrames>>): Promise<void> {
  const before = await counts.jsonValue();
  await page.clock.runFor(5000);
  expect(await counts.jsonValue()).toEqual(before);
}

async function setHidden(page: Page, hidden: boolean): Promise<void> {
  await page.evaluate(hidden => {
    Object.defineProperty(document, 'hidden', { configurable: true, get: () => hidden });
    Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => hidden ? 'hidden' : 'visible' });
    document.dispatchEvent(new Event('visibilitychange'));
  }, hidden);
}

async function flyThroughPipes(page: Page): Promise<void> {
  await page.locator(boardSelector).focus();
  for (let step = 0; step < 100; step++) {
    const y = Number(await page.locator(boardSelector).getAttribute('data-bird-y'));
    const velocity = Number(await page.locator(boardSelector).getAttribute('data-velocity'));
    if (y > 265 && velocity > 0) await page.keyboard.press('Space');
    await page.clock.runFor(50);
  }
  await expect(page.locator(boardSelector)).toHaveAttribute('data-state', 'playing');
  expect(Number(await page.locator('#flappy-score').textContent())).toBeGreaterThanOrEqual(2);
}

test.beforeEach(async ({ page }) => {
  const time = new Date('2026-09-22T12:00:00Z');
  await page.clock.install({ time });
  await page.clock.pauseAt(new Date(time.getTime() + 1000));
  await page.addInitScript(() => { Math.random = () => .5; });
  await page.goto('/#/games/flappy-bird');
  await expect(page.locator(boardSelector)).toHaveAttribute('data-state', 'ready');
});

test('拍翅、自然下落、暂停冻结和继续保留速度', async ({ page }) => {
  const board = page.locator(boardSelector);
  const counts = await trackFrames(page);
  await board.focus();
  await page.keyboard.press('Space');
  await expect(board).toHaveAttribute('data-state', 'playing');
  await page.clock.runFor(200);
  expect(Number(await board.getAttribute('data-bird-y'))).toBeLessThan(254);
  await page.clock.runFor(300);
  expect(Number(await board.getAttribute('data-velocity'))).toBeGreaterThan(0);
  await page.keyboard.press('ArrowUp');
  await expect(board).toHaveAttribute('data-velocity', '-350');
  await page.clock.runFor(64);
  const playingFrames = (await counts.jsonValue()).frames;
  await page.keyboard.press('p');
  await expect(board).toHaveAttribute('data-state', 'paused');
  await page.clock.runFor(32);
  expect((await counts.jsonValue()).frames).toBe(playingFrames + 1);
  const position = await board.getAttribute('data-bird-y');
  const velocity = await board.getAttribute('data-velocity');
  const picture = await board.locator('canvas').evaluate(canvas => (canvas as HTMLCanvasElement).toDataURL());
  await expectNoFrames(page, counts);
  await expect(board).toHaveAttribute('data-bird-y', position!);
  expect(await board.locator('canvas').evaluate(canvas => (canvas as HTMLCanvasElement).toDataURL())).toBe(picture);
  await page.locator('#flappy-overlay-action').click();
  await expect(board).toHaveAttribute('data-velocity', velocity!);
  await page.clock.runFor(16);
  await expect(board).toHaveAttribute('data-bird-y', position!);
  await expect(board).toHaveAttribute('data-velocity', velocity!);
  await page.clock.runFor(16);
  await expect(board).not.toHaveAttribute('data-bird-y', position!);
  expect((await counts.jsonValue()).frames).toBe(playingFrames + 3);
});

test('穿过水管计分、落地结算、再飞一次和本地纪录持久化', async ({ page }, testInfo) => {
  const board = page.locator(boardSelector);
  const counts = await trackFrames(page);
  await page.locator('#flappy-overlay-action').click();
  await flyThroughPipes(page);
  const score = (await page.locator('#flappy-score').textContent())!;
  await expect(page.locator('#flappy-best')).toHaveText(score);
  await page.screenshot({ path: testInfo.outputPath('playing.png'), fullPage: true });
  await page.clock.runFor(2500);
  await expect(board).toHaveAttribute('data-state', 'over');
  await expect(page.locator('#flappy-score')).toHaveText(score);
  await expect(page.locator('.result-score strong')).toHaveText(String(Number(score)));
  const fallen = await board.getAttribute('data-bird-y');
  expect((await counts.jsonValue()).birdY).toBe(Number(fallen));
  await expectNoFrames(page, counts);
  await expect(board).toHaveAttribute('data-bird-y', fallen!);
  await page.locator('#flappy-overlay-action').click();
  await expect(board).toHaveAttribute('data-state', 'playing');
  await expect(page.locator('#flappy-score')).toHaveText('00');
  await expect(page.locator('#flappy-best')).toHaveText(score);
  const restartFrames = (await counts.jsonValue()).frames;
  await page.clock.runFor(160);
  expect((await counts.jsonValue()).frames - restartFrames).toBe(10);
  await expect(board).not.toHaveAttribute('data-bird-y', '254');
  await page.reload();
  await expect(board).toHaveAttribute('data-state', 'ready');
  await expect(page.locator('#flappy-best')).toHaveText(score);
});

test('准备态保留漂浮，隐藏停止、显示恢复但不自动继续游戏', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await page.reload();
  const board = page.locator(boardSelector);
  const counts = await trackFrames(page);
  const picture = await board.locator('canvas').evaluate(canvas => (canvas as HTMLCanvasElement).toDataURL());
  await page.clock.runFor(160);
  expect((await counts.jsonValue()).frames).toBe(10);
  expect(await board.locator('canvas').evaluate(canvas => (canvas as HTMLCanvasElement).toDataURL())).not.toBe(picture);
  await expect(board).toHaveAttribute('data-bird-y', '254');
  await setHidden(page, true);
  await expectNoFrames(page, counts);
  await setHidden(page, false);
  // Repeated notifications must not create a second animation chain.
  await setHidden(page, false);
  const readyFrames = (await counts.jsonValue()).frames;
  await page.clock.runFor(160);
  expect((await counts.jsonValue()).frames - readyFrames).toBe(10);
  await expect(board).toHaveAttribute('data-state', 'ready');
  await page.locator('#flappy-overlay-action').click();
  await page.clock.runFor(64);
  const position = await board.getAttribute('data-bird-y');
  await setHidden(page, true);
  await expect(board).toHaveAttribute('data-state', 'paused');
  await expectNoFrames(page, counts);
  await setHidden(page, false);
  const hiddenFrames = (await counts.jsonValue()).frames;
  await page.clock.runFor(32);
  expect((await counts.jsonValue()).frames).toBe(hiddenFrames + 1);
  await expectNoFrames(page, counts);
  await expect(board).toHaveAttribute('data-state', 'paused');
  await expect(board).toHaveAttribute('data-bird-y', position!);
  await page.locator('#flappy-overlay-action').click();
  await page.clock.runFor(16);
  await expect(board).toHaveAttribute('data-bird-y', position!);
  await page.clock.runFor(16);
  await expect(board).not.toHaveAttribute('data-bird-y', position!);
});

test('鼠标或触屏轻点拍翅、忽略重复按键且不滚动页面', async ({ page, isMobile }, testInfo) => {
  const board = page.locator(boardSelector);
  await page.screenshot({ path: testInfo.outputPath('ready.png'), fullPage: true });
  await page.locator('#flappy-start').focus();
  await page.keyboard.press('Space');
  await expect(board).toHaveAttribute('data-state', 'playing');
  await page.clock.runFor(450);
  await board.scrollIntoViewIfNeeded();
  const scroll = await page.evaluate(() => scrollY);
  if (isMobile) await board.tap({ position: { x: 80, y: 130 } });
  else await board.click({ position: { x: 80, y: 130 } });
  await expect(board).toHaveAttribute('data-velocity', '-350');
  await page.clock.runFor(100);
  const velocity = await board.getAttribute('data-velocity');
  await board.dispatchEvent('keydown', { code: 'Space', key: ' ', repeat: true, bubbles: true });
  await expect(board).toHaveAttribute('data-velocity', velocity!);
  await page.keyboard.press('Control+ArrowUp');
  await expect(board).toHaveAttribute('data-velocity', velocity!);
  await page.keyboard.press('w');
  await expect(board).toHaveAttribute('data-velocity', '-350');
  expect(await page.evaluate(() => scrollY)).toBe(scroll);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.keyboard.press('Escape');
  await expect(board).toHaveAttribute('data-state', 'paused');
});

test('重开确认取消、失焦暂停、离开清理与重新进入', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  const board = page.locator(boardSelector);
  const counts = await trackFrames(page);
  await page.locator('#flappy-overlay-action').click();
  await page.clock.runFor(200);
  let position = await board.getAttribute('data-bird-y');
  await page.keyboard.press('r');
  await expect(page.getByRole('dialog')).toBeVisible();
  await page.clock.runFor(32);
  await expectNoFrames(page, counts);
  await expect(board).toHaveAttribute('data-bird-y', position!);
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog')).toBeHidden();
  await expect(board).toHaveAttribute('data-state', 'playing');
  const dialogFrames = (await counts.jsonValue()).frames;
  await page.clock.runFor(16);
  await expect(board).toHaveAttribute('data-bird-y', position!);
  await page.clock.runFor(16);
  await expect(board).not.toHaveAttribute('data-bird-y', position!);
  expect((await counts.jsonValue()).frames - dialogFrames).toBe(2);
  position = await board.getAttribute('data-bird-y');
  await page.locator('#flappy-restart').click();
  await page.evaluate(() => window.dispatchEvent(new Event('blur')));
  await page.getByRole('button', { name: '继续本局', exact: true }).click();
  await expect(board).toHaveAttribute('data-state', 'paused');
  await page.clock.runFor(32);
  await expectNoFrames(page, counts);
  await page.keyboard.press('p');
  await expect(board).toHaveAttribute('data-state', 'playing');
  await page.evaluate(() => window.dispatchEvent(new Event('blur')));
  await expect(board).toHaveAttribute('data-state', 'paused');
  await page.clock.runFor(32);
  await expectNoFrames(page, counts);
  await expect(board).toHaveAttribute('data-bird-y', position!);
  await page.locator('#flappy-restart').click();
  await page.getByRole('button', { name: '确定重开', exact: true }).click();
  await expect(board).toHaveAttribute('data-state', 'ready');
  await expect(board).toHaveAttribute('data-bird-y', '254');
  await expect(page.locator('.flight-time')).toHaveText('00:00');
  await expect(page.locator('#flappy-restart')).toBeDisabled();
  const restartFrames = (await counts.jsonValue()).frames;
  await page.clock.runFor(160);
  expect((await counts.jsonValue()).frames - restartFrames).toBe(10);
  await page.locator('#flappy-start').click();
  await page.getByRole('link', { name: '返回大厅' }).click();
  await expect(board).toHaveCount(0);
  await page.evaluate(() => {
    window.dispatchEvent(new Event('blur'));
    document.dispatchEvent(new Event('visibilitychange'));
    document.dispatchEvent(new KeyboardEvent('keydown', { code: 'Space' }));
  });
  await expectNoFrames(page, counts);
  await page.getByRole('link', { name: '开始玩Flappy Bird', exact: true }).click();
  await expect(board).toHaveAttribute('data-state', 'ready');
  const newCounts = await trackFrames(page);
  await page.clock.runFor(160);
  expect((await newCounts.jsonValue()).frames).toBe(10);
  await page.getByRole('link', { name: '返回大厅' }).click();
  await expect(board).toHaveCount(0);
  await setHidden(page, true);
  await setHidden(page, false);
  await expectNoFrames(page, newCounts);
  expect(errors).toEqual([]);
});

test('双页面交错保存：storage 事件未送达时低分也不能覆盖最新高分', async ({ page, context }) => {
  const key = 'little-break-flappy-bird-best-v1';
  const other = await context.newPage();
  await other.goto('/#/games/flappy-bird');
  await expect(other.locator(boardSelector)).toHaveAttribute('data-state', 'ready');
  await page.getByRole('link', { name: '返回大厅' }).click();
  // Install before mounting: window storage listeners run in registration order.
  const deliveries = await page.evaluateHandle(key => {
    const events = { count: 0 };
    window.addEventListener('storage', event => {
      if (event.key === key) { events.count++; event.stopImmediatePropagation(); }
    }, true);
    return events;
  }, key);
  await page.getByRole('link', { name: '开始玩Flappy Bird', exact: true }).click();
  await expect(page.locator(boardSelector)).toHaveAttribute('data-state', 'ready');
  await other.evaluate(key => localStorage.setItem(key, '50'), key);
  await expect.poll(async () => (await deliveries.jsonValue()).count).toBe(1);
  await expect(page.locator('#flappy-best')).toHaveText('00');
  await page.locator('#flappy-overlay-action').click();
  await flyThroughPipes(page);
  expect(Number(await page.locator('#flappy-score').textContent())).toBeLessThan(50);
  expect(await other.evaluate(key => localStorage.getItem(key), key)).toBe('50');
  await expect(page.locator('#flappy-best')).toHaveText('50');
  await other.close();
});

test('双页面原生 storage 同步只更新纪录，不改变游戏和输入或回写存储', async ({ page, context }) => {
  const key = 'little-break-flappy-bird-best-v1';
  const other = await context.newPage();
  await other.goto('/#/games/flappy-bird');
  await expect(other.locator(boardSelector)).toHaveAttribute('data-state', 'ready');
  await page.locator('#flappy-overlay-action').click();
  await flyThroughPipes(page);
  const score = (await page.locator('#flappy-score').textContent())!;
  await expect(other.locator('#flappy-best')).toHaveText(score);
  await expect(other.locator(boardSelector)).toHaveAttribute('data-state', 'ready');
  await expect(other.locator('#flappy-score')).toHaveText('00');
  const board = page.locator(boardSelector);
  const position = await board.getAttribute('data-bird-y');
  const velocity = await board.getAttribute('data-velocity');
  const calls = await page.evaluateHandle(key => {
    const calls = { reads: 0, writes: 0, events: 0 };
    const get = Storage.prototype.getItem;
    const set = Storage.prototype.setItem;
    Storage.prototype.getItem = function (name) { if (name === key) calls.reads++; return get.call(this, name); };
    Storage.prototype.setItem = function (name, value) { if (name === key) calls.writes++; return set.call(this, name, value); };
    window.addEventListener('storage', event => { if (event.key === key) calls.events++; });
    return calls;
  }, key);
  for (const [index, value] of ['50', '1', '-1', 'NaN', '1.5', 'Infinity', '9007199254740992'].entries()) {
    await other.evaluate(({ key, value }) => localStorage.setItem(key, value), { key, value });
    await expect.poll(async () => (await calls.jsonValue()).events).toBe(index + 1);
    await expect(page.locator('#flappy-best')).toHaveText('50');
  }
  await expect(board).toHaveAttribute('data-state', 'playing');
  await expect(board).toHaveAttribute('data-bird-y', position!);
  await expect(board).toHaveAttribute('data-velocity', velocity!);
  await expect(page.locator('#flappy-score')).toHaveText(score);
  await page.keyboard.press('Space');
  await expect(board).toHaveAttribute('data-velocity', '-350');
  await page.clock.runFor(64);
  expect(await calls.jsonValue()).toEqual({ reads: 0, writes: 0, events: 7 });
  await other.close();
});

test('损坏或禁用本地存储时依然可正常计分游玩', async ({ page }) => {
  for (const value of ['-1', 'NaN', '1.5', 'Infinity']) {
    await page.evaluate(value => localStorage.setItem('little-break-flappy-bird-best-v1', value), value);
    await page.reload();
    await expect(page.locator('#flappy-best')).toHaveText('00');
  }
  await page.addInitScript(() => {
    Storage.prototype.getItem = () => { throw new DOMException('Blocked', 'SecurityError'); };
    Storage.prototype.setItem = () => { throw new DOMException('Blocked', 'SecurityError'); };
  });
  await page.reload();
  await expect(page.locator('.save-note')).toContainText('浏览器存储不可用');
  await page.locator('#flappy-overlay-action').click();
  await flyThroughPipes(page);
  await expect(page.locator('#flappy-best')).toHaveText((await page.locator('#flappy-score').textContent())!);
});

test('窄屏布局和减少动态效果偏好下可使用开始与结算按钮', async ({ page }, testInfo) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.setViewportSize({ width: 320, height: 740 });
  await page.reload();
  await expect(page.locator('#flappy-overlay-action')).toBeVisible();
  const counts = await trackFrames(page);
  const canvas = page.locator(`${boardSelector} canvas`);
  const picture = await canvas.evaluate(canvas => (canvas as HTMLCanvasElement).toDataURL());
  await expectNoFrames(page, counts);
  await setHidden(page, true);
  await setHidden(page, false);
  await expectNoFrames(page, counts);
  expect(await canvas.evaluate(canvas => (canvas as HTMLCanvasElement).toDataURL())).toBe(picture);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.locator('#flappy-overlay-action').click();
  await page.clock.runFor(2000);
  await expect(page.locator(boardSelector)).toHaveAttribute('data-state', 'over');
  expect((await counts.jsonValue()).frames).toBeGreaterThan(0);
  await expectNoFrames(page, counts);
  await page.screenshot({ path: testInfo.outputPath('narrow-over.png'), fullPage: true });
  await page.locator('#flappy-restart').click();
  await expect(page.locator(boardSelector)).toHaveAttribute('data-state', 'ready');
  const overFrames = (await counts.jsonValue()).frames;
  await page.clock.runFor(32);
  expect(await counts.jsonValue()).toEqual({ frames: overFrames + 1, birdY: 254 });
  await expectNoFrames(page, counts);
  await page.locator('#flappy-overlay-action').click();
  await expect(page.locator(boardSelector)).toHaveAttribute('data-state', 'playing');
  await page.clock.runFor(32);
  await expect(page.locator(boardSelector)).not.toHaveAttribute('data-bird-y', '254');
});
