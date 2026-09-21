import { test, expect } from '@playwright/test';
import type { Page } from '@playwright/test';

const boardSelector = '.breakout-board';

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
  await page.locator('#breakout-overlay-action').click();
  await page.clock.runFor(1600);
  const score = await page.locator('#breakout-score').textContent();
  expect(Number(score)).toBeGreaterThan(0);
  expect(Number(await page.locator('#breakout-remaining').textContent())).toBeLessThan(40);
  await page.keyboard.press('Space');
  await expect(board).toHaveAttribute('data-state', 'paused');
  const ball = await board.getAttribute('data-ball-y');
  const position = await paddle(page);
  await page.keyboard.down('ArrowLeft');
  await page.clock.runFor(3000);
  await page.keyboard.up('ArrowLeft');
  await expect(board).toHaveAttribute('data-ball-y', ball!);
  expect(await paddle(page)).toBe(position);
  await expect(page.locator('#breakout-score')).toHaveText(score!);
  await page.locator('#breakout-overlay-action').click();
  await page.clock.runFor(32);
  await expect(board).not.toHaveAttribute('data-ball-y', ball!);
  await page.keyboard.press('r');
  await expect(page.getByRole('dialog')).toBeVisible();
  await page.clock.runFor(2000);
  await page.getByRole('button', { name: '继续本局', exact: true }).click();
  await expect(board).toHaveAttribute('data-state', 'playing');
  await page.locator('#breakout-restart').click();
  await page.getByRole('button', { name: '确定重开', exact: true }).click();
  await expect(board).toHaveAttribute('data-state', 'ready');
  await expect(page.locator('#breakout-score')).toHaveText('0000');
  await expect(page.locator('#breakout-remaining')).toHaveText('40');
  await expect(page.locator('.lives')).toHaveAttribute('data-lives', '3');
  await expect(page.locator('#breakout-best')).toHaveText(score!);
  await page.reload();
  await expect(page.locator('#breakout-best')).toHaveText(score!);
});

test('左右键和 AD 连续移动，边界限制，按钮空格不会重复触发', async ({ page }) => {
  const board = page.locator(boardSelector);
  await board.focus();
  const initial = await paddle(page);
  await page.keyboard.down('ArrowLeft');
  await page.clock.runFor(160);
  await page.keyboard.up('ArrowLeft');
  expect(await paddle(page)).toBeLessThan(initial);
  await page.keyboard.down('d');
  await page.clock.runFor(2000);
  await page.keyboard.up('d');
  expect(await paddle(page)).toBe(432);
  await page.keyboard.down('a');
  await page.clock.runFor(2000);
  await page.keyboard.up('a');
  expect(await paddle(page)).toBe(48);
  await page.locator('#breakout-start').focus();
  await page.keyboard.press('Space');
  await expect(board).toHaveAttribute('data-state', 'playing');
  await page.keyboard.press('Escape');
  await expect(board).toHaveAttribute('data-state', 'paused');
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
  await page.locator('#breakout-overlay-action').click();
  for (let lives = 2; lives >= 0; lives--) {
    await aim(page, .95);
    await page.clock.runFor(8000);
    await expect(board).toHaveAttribute('data-state', lives ? 'life-lost' : 'over');
    await expect(page.locator('.lives')).toHaveAttribute('data-lives', String(lives));
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
  await page.locator('#breakout-start').click();
  await page.keyboard.down('ArrowLeft');
  await page.clock.runFor(64);
  await page.evaluate(() => window.dispatchEvent(new Event('blur')));
  await expect(board).toHaveAttribute('data-state', 'paused');
  const position = await paddle(page);
  await page.locator('#breakout-restart').click();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog')).toBeHidden();
  await expect(board).toHaveAttribute('data-state', 'paused');
  await page.locator('#breakout-overlay-action').click();
  await page.clock.runFor(160);
  expect(await paddle(page)).toBe(position);
  await page.keyboard.up('ArrowLeft');
  await page.getByRole('link', { name: '返回大厅' }).click();
  await page.clock.runFor(60000);
  await expect(page.locator('.breakout-game')).toHaveCount(0);
  await page.getByRole('link', { name: '开始玩打砖块', exact: true }).click();
  await expect(board).toHaveAttribute('data-state', 'ready');
  expect(errors).toEqual([]);
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
