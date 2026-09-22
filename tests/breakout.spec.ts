import { test, expect } from '@playwright/test';
import type { Page } from '@playwright/test';

const boardSelector = '.breakout-board';

async function trackFrames(page: Page) {
  return page.locator(`${boardSelector} canvas`).evaluateHandle(canvas => {
    const context = (canvas as HTMLCanvasElement).getContext('2d')!;
    const counts = { frames: 0, arcs: 0, ballX: 0, ballY: 0 };
    const fillRect = context.fillRect;
    const arc = context.arc;
    // The background fill marks one complete renderer pass, not individual bricks.
    context.fillRect = function (...args) {
      if (args[0] === 0 && args[1] === 0 && args[2] === 480 && args[3] === 560) {
        counts.frames++;
        counts.arcs = 0;
      }
      fillRect.apply(this, args);
    };
    context.arc = function (...args) {
      counts.arcs++;
      if (args[2] === 7) { counts.ballX = args[0]; counts.ballY = args[1]; }
      arc.apply(this, args);
    };
    return counts;
  });
}

async function expectNoFrames(page: Page, counts: Awaited<ReturnType<typeof trackFrames>>): Promise<void> {
  const before = await counts.jsonValue();
  await page.clock.runFor(5000);
  expect(await counts.jsonValue()).toEqual(before);
}

async function paddle(page: Page): Promise<number> {
  return Number(await page.locator(boardSelector).getAttribute('data-paddle'));
}

async function aim(page: Page, fraction: number): Promise<void> {
  const board = page.locator(boardSelector);
  await board.scrollIntoViewIfNeeded();
  const bounds = (await board.boundingBox())!;
  await page.mouse.move(bounds.x + bounds.width * fraction, bounds.y + bounds.height * .9);
}

test.beforeEach(async ({ page }) => {
  const time = new Date('2026-09-21T12:00:00Z');
  await page.clock.install({ time });
  await page.clock.pauseAt(new Date(time.getTime() + 1000));
  await page.goto('/#/games/breakout');
  await expect(page.locator(boardSelector)).toHaveAttribute('data-state', 'ready');
});

test('发球击砖得分、暂停冻结、重开与最高纪录保留', async ({ page }) => {
  const board = page.locator(boardSelector);
  const counts = await trackFrames(page);
  await page.locator('#breakout-overlay-action').click();
  await page.clock.runFor(1600);
  expect((await counts.jsonValue()).arcs).toBeGreaterThan(2);
  const score = await page.locator('#breakout-score').textContent();
  expect(Number(score)).toBeGreaterThan(0);
  expect(Number(await page.locator('#breakout-remaining').textContent())).toBeLessThan(40);
  const playingFrames = (await counts.jsonValue()).frames;
  await page.keyboard.press('Space');
  await expect(board).toHaveAttribute('data-state', 'paused');
  const ball = await board.getAttribute('data-ball-y');
  const position = await paddle(page);
  await page.clock.runFor(32);
  expect(await counts.jsonValue()).toMatchObject({ frames: playingFrames + 1, arcs: 2, ballY: Number(ball) });
  await page.keyboard.down('ArrowLeft');
  await expectNoFrames(page, counts);
  await page.keyboard.up('ArrowLeft');
  await expect(board).toHaveAttribute('data-ball-y', ball!);
  expect(await paddle(page)).toBe(position);
  await expect(page.locator('#breakout-score')).toHaveText(score!);
  await page.locator('#breakout-overlay-action').click();
  await page.clock.runFor(16);
  await expect(board).toHaveAttribute('data-ball-y', ball!);
  await page.clock.runFor(16);
  await expect(board).not.toHaveAttribute('data-ball-y', ball!);
  await page.keyboard.press('r');
  await expect(page.getByRole('dialog')).toBeVisible();
  await page.clock.runFor(32);
  await expectNoFrames(page, counts);
  await page.getByRole('button', { name: '继续本局', exact: true }).click();
  await expect(board).toHaveAttribute('data-state', 'playing');
  const dialogBall = await board.getAttribute('data-ball-y');
  const dialogFrames = (await counts.jsonValue()).frames;
  await page.clock.runFor(32);
  await expect(board).not.toHaveAttribute('data-ball-y', dialogBall!);
  expect((await counts.jsonValue()).frames - dialogFrames).toBe(2);
  await page.locator('#breakout-restart').click();
  await page.getByRole('button', { name: '确定重开', exact: true }).click();
  await expect(board).toHaveAttribute('data-state', 'ready');
  await expect(page.locator('#breakout-score')).toHaveText('0000');
  await expect(page.locator('#breakout-remaining')).toHaveText('40');
  await expect(page.locator('.lives')).toHaveAttribute('data-lives', '3');
  await expect(page.locator('#breakout-best')).toHaveText(score!);
  const beforeRestartDraw = (await counts.jsonValue()).frames;
  await page.clock.runFor(32);
  expect(await counts.jsonValue()).toMatchObject({ frames: beforeRestartDraw + 1, arcs: 2, ballX: 240, ballY: 507 });
  await expectNoFrames(page, counts);
  await page.reload();
  await expect(page.locator('#breakout-best')).toHaveText(score!);
});

test('左右键和 AD 连续移动，边界限制，按钮空格不会重复触发', async ({ page }) => {
  const board = page.locator(boardSelector);
  const counts = await trackFrames(page);
  await expectNoFrames(page, counts);
  await board.focus();
  const initial = await paddle(page);
  await page.keyboard.down('ArrowLeft');
  await page.clock.runFor(16);
  expect(await paddle(page)).toBe(initial);
  await page.clock.runFor(144);
  await page.keyboard.up('ArrowLeft');
  expect(await paddle(page)).toBeLessThan(initial);
  expect((await counts.jsonValue()).frames).toBe(10);
  await expectNoFrames(page, counts);
  await page.keyboard.down('d');
  await page.clock.runFor(2000);
  expect(await paddle(page)).toBe(432);
  await expectNoFrames(page, counts);
  await page.keyboard.up('d');
  await page.keyboard.down('a');
  await page.clock.runFor(2000);
  await page.keyboard.up('a');
  expect(await paddle(page)).toBe(48);
  await page.keyboard.down('ArrowRight');
  await page.clock.runFor(64);
  await page.keyboard.down('ArrowLeft');
  await expectNoFrames(page, counts);
  await page.keyboard.up('ArrowLeft');
  await page.clock.runFor(64);
  const beforeBlur = await paddle(page);
  await page.evaluate(() => window.dispatchEvent(new Event('blur')));
  await expectNoFrames(page, counts);
  expect(await paddle(page)).toBe(beforeBlur);
  await page.keyboard.up('ArrowRight');
  await page.locator('#breakout-start').focus();
  await page.keyboard.press('Space');
  await expect(board).toHaveAttribute('data-state', 'playing');
  await page.keyboard.press('Escape');
  await expect(board).toHaveAttribute('data-state', 'paused');
});

test('准备态指针移动仅请求一帧，松键不丢失待绘制画面', async ({ page }) => {
  const board = page.locator(boardSelector);
  const counts = await trackFrames(page);
  const bounds = (await board.boundingBox())!;
  // Dispatch to the court itself: the ready overlay intentionally stops pointer events.
  for (const fraction of [.2, .4, .7]) {
    await board.dispatchEvent('pointermove', {
      isPrimary: true, pointerType: 'mouse', clientX: bounds.x + bounds.width * fraction,
    });
  }
  await page.keyboard.up('ArrowLeft');
  expect((await counts.jsonValue()).frames).toBe(0);
  await page.clock.runFor(32);
  expect(await counts.jsonValue()).toMatchObject({ frames: 1, arcs: 2, ballX: await paddle(page) });
  await expectNoFrames(page, counts);
});

test('鼠标和真实触屏拖动控制挡板，不触发页面滚动', async ({ page, isMobile }, testInfo) => {
  await page.screenshot({ path: testInfo.outputPath('ready.png'), fullPage: true });
  await page.locator('#breakout-overlay-action').click();
  const board = page.locator(boardSelector);
  await board.scrollIntoViewIfNeeded();
  const bounds = (await board.boundingBox())!;
  const y = bounds.y + bounds.height * .88;
  const scroll = await page.evaluate(() => scrollY);
  if (isMobile) {
    const session = await page.context().newCDPSession(page);
    await session.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: bounds.x + bounds.width * .7, y }] });
    expect(await paddle(page)).toBeGreaterThan(300);
    await session.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: bounds.x + bounds.width * .2, y: y - 30 }] });
    expect(await paddle(page)).toBeLessThan(110);
    await session.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    await session.detach();
  } else {
    await aim(page, .7);
    expect(await paddle(page)).toBeGreaterThan(300);
    await aim(page, .2);
    expect(await paddle(page)).toBeLessThan(110);
  }
  expect(await page.evaluate(() => scrollY)).toBe(scroll);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.clock.runFor(800);
  await page.screenshot({ path: testInfo.outputPath('playing.png'), fullPage: true });
});

test('落球扣命、重新发球保留进度，耗尽生命后可重玩', async ({ page }) => {
  const board = page.locator(boardSelector);
  const counts = await trackFrames(page);
  await page.locator('#breakout-overlay-action').click();
  for (let lives = 2; lives >= 0; lives--) {
    await aim(page, .95);
    await page.clock.runFor(8000);
    await expect(board).toHaveAttribute('data-state', lives ? 'life-lost' : 'over');
    await expect(page.locator('.lives')).toHaveAttribute('data-lives', String(lives));
    expect(await counts.jsonValue()).toMatchObject({
      arcs: 2, ballX: Number(await board.getAttribute('data-ball-x')), ballY: Number(await board.getAttribute('data-ball-y')),
    });
    await expectNoFrames(page, counts);
    const position = await paddle(page);
    await board.focus();
    await page.keyboard.down('ArrowLeft');
    await page.clock.runFor(64);
    await page.keyboard.up('ArrowLeft');
    if (lives) expect(await paddle(page)).toBeLessThan(position);
    else expect(await paddle(page)).toBe(position);
    await expectNoFrames(page, counts);
    const score = await page.locator('#breakout-score').textContent();
    const remaining = await page.locator('#breakout-remaining').textContent();
    await page.locator('#breakout-overlay-action').click();
    await expect(board).toHaveAttribute('data-state', 'playing');
    if (lives) {
      await expect(page.locator('#breakout-score')).toHaveText(score!);
      await expect(page.locator('#breakout-remaining')).toHaveText(remaining!);
    }
  }
  await expect(page.locator('.lives')).toHaveAttribute('data-lives', '3');
  await expect(page.locator('#breakout-score')).toHaveText('0000');
});

test('失焦自动暂停、清理按键、取消重开与离开清理', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  const board = page.locator(boardSelector);
  const counts = await trackFrames(page);
  await page.locator('#breakout-start').click();
  await page.keyboard.down('ArrowLeft');
  await page.clock.runFor(64);
  await page.evaluate(() => window.dispatchEvent(new Event('blur')));
  await expect(board).toHaveAttribute('data-state', 'paused');
  const position = await paddle(page);
  await page.clock.runFor(32);
  await expectNoFrames(page, counts);
  await page.locator('#breakout-restart').click();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog')).toBeHidden();
  await expect(board).toHaveAttribute('data-state', 'paused');
  await page.clock.runFor(32);
  await expectNoFrames(page, counts);
  await page.locator('#breakout-overlay-action').click();
  const beforeResume = (await counts.jsonValue()).frames;
  await page.clock.runFor(160);
  expect((await counts.jsonValue()).frames - beforeResume).toBe(10);
  expect(await paddle(page)).toBe(position);
  await page.keyboard.up('ArrowLeft');
  await page.locator('#breakout-restart').click();
  await page.evaluate(() => window.dispatchEvent(new Event('blur')));
  await page.keyboard.press('Escape');
  await expect(board).toHaveAttribute('data-state', 'paused');
  await page.clock.runFor(32);
  await expectNoFrames(page, counts);
  await page.locator('#breakout-overlay-action').click();
  await page.clock.runFor(32);
  await page.getByRole('link', { name: '返回大厅' }).click();
  await expect(page.locator('.breakout-game')).toHaveCount(0);
  await page.evaluate(() => {
    window.dispatchEvent(new Event('blur'));
    document.dispatchEvent(new Event('visibilitychange'));
    document.dispatchEvent(new KeyboardEvent('keydown', { code: 'ArrowLeft' }));
  });
  await expectNoFrames(page, counts);
  await page.getByRole('link', { name: '开始玩打砖块', exact: true }).click();
  await expect(board).toHaveAttribute('data-state', 'ready');
  expect(errors).toEqual([]);
});

test('双页面交错保存：storage 事件未送达时低分也不能覆盖最新高分', async ({ page, context }) => {
  const key = 'little-break-breakout-best-v1';
  const other = await context.newPage();
  await other.goto('/#/games/breakout');
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
  await page.getByRole('link', { name: '开始玩打砖块', exact: true }).click();
  await expect(page.locator(boardSelector)).toHaveAttribute('data-state', 'ready');
  await other.evaluate(key => localStorage.setItem(key, '5000'), key);
  await expect.poll(async () => (await deliveries.jsonValue()).count).toBe(1);
  await expect(page.locator('#breakout-best')).toHaveText('0000');
  await page.locator('#breakout-overlay-action').click();
  await page.clock.runFor(1600);
  const score = Number(await page.locator('#breakout-score').textContent());
  expect(score).toBeGreaterThan(0);
  expect(score).toBeLessThan(5000);
  expect(await other.evaluate(key => localStorage.getItem(key), key)).toBe('5000');
  await expect(page.locator('#breakout-best')).toHaveText('5000');
  await other.close();
});

test('双页面原生 storage 同步只更新纪录，不改变游戏和输入或回写存储', async ({ page, context }) => {
  const key = 'little-break-breakout-best-v1';
  const other = await context.newPage();
  await other.goto('/#/games/breakout');
  await expect(other.locator(boardSelector)).toHaveAttribute('data-state', 'ready');
  await page.locator('#breakout-overlay-action').click();
  await page.clock.runFor(1600);
  const score = (await page.locator('#breakout-score').textContent())!;
  await expect(other.locator('#breakout-best')).toHaveText(score);
  await expect(other.locator(boardSelector)).toHaveAttribute('data-state', 'ready');
  await expect(other.locator('#breakout-score')).toHaveText('0000');
  const ball = await page.locator(boardSelector).getAttribute('data-ball-y');
  const position = await paddle(page);
  await page.keyboard.down('ArrowLeft');
  const calls = await page.evaluateHandle(key => {
    const calls = { reads: 0, writes: 0, events: 0 };
    const get = Storage.prototype.getItem;
    const set = Storage.prototype.setItem;
    Storage.prototype.getItem = function (name) { if (name === key) calls.reads++; return get.call(this, name); };
    Storage.prototype.setItem = function (name, value) { if (name === key) calls.writes++; return set.call(this, name, value); };
    window.addEventListener('storage', event => { if (event.key === key) calls.events++; });
    return calls;
  }, key);
  for (const [index, value] of ['5000', '10', '-1', 'NaN', '1.5', 'Infinity', '9007199254740992'].entries()) {
    await other.evaluate(({ key, value }) => localStorage.setItem(key, value), { key, value });
    await expect.poll(async () => (await calls.jsonValue()).events).toBe(index + 1);
    await expect(page.locator('#breakout-best')).toHaveText('5000');
  }
  await expect(page.locator(boardSelector)).toHaveAttribute('data-state', 'playing');
  await expect(page.locator(boardSelector)).toHaveAttribute('data-ball-y', ball!);
  await expect(page.locator('#breakout-score')).toHaveText(score);
  expect(await paddle(page)).toBe(position);
  await page.clock.runFor(64);
  await page.keyboard.up('ArrowLeft');
  expect(await paddle(page)).toBeLessThan(position);
  expect(await calls.jsonValue()).toEqual({ reads: 0, writes: 0, events: 7 });
  await other.close();
});

test('存储损坏或被禁用不影响正常游玩', async ({ page }) => {
  await page.evaluate(() => localStorage.setItem('little-break-breakout-best-v1', '-100'));
  await page.reload();
  await expect(page.locator('#breakout-best')).toHaveText('0000');
  await page.addInitScript(() => {
    Storage.prototype.getItem = () => { throw new DOMException('Storage blocked', 'SecurityError'); };
    Storage.prototype.setItem = () => { throw new DOMException('Storage blocked', 'SecurityError'); };
  });
  await page.reload();
  await expect(page.locator('.save-note')).toContainText('浏览器存储不可用');
  await page.locator('#breakout-overlay-action').click();
  await page.clock.runFor(1600);
  expect(Number(await page.locator('#breakout-score').textContent())).toBeGreaterThan(0);
  await expect(page.locator('#breakout-best')).toHaveText((await page.locator('#breakout-score').textContent())!);
});
