import { test, expect } from '@playwright/test';
import type { Page } from '@playwright/test';

const boardSelector = '.flappy-board';

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
  await page.keyboard.press('p');
  await expect(board).toHaveAttribute('data-state', 'paused');
  await page.clock.runFor(32);
  const position = await board.getAttribute('data-bird-y');
  const velocity = await board.getAttribute('data-velocity');
  const picture = await board.locator('canvas').evaluate(canvas => (canvas as HTMLCanvasElement).toDataURL());
  await page.clock.runFor(5000);
  await expect(board).toHaveAttribute('data-bird-y', position!);
  expect(await board.locator('canvas').evaluate(canvas => (canvas as HTMLCanvasElement).toDataURL())).toBe(picture);
  await page.locator('#flappy-overlay-action').click();
  await expect(board).toHaveAttribute('data-velocity', velocity!);
  await page.clock.runFor(100);
  await expect(board).not.toHaveAttribute('data-bird-y', position!);
});

test('穿过水管计分、落地结算、再飞一次和本地纪录持久化', async ({ page }, testInfo) => {
  const board = page.locator(boardSelector);
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
  await page.clock.runFor(2000);
  await expect(board).toHaveAttribute('data-bird-y', fallen!);
  await page.locator('#flappy-overlay-action').click();
  await expect(board).toHaveAttribute('data-state', 'playing');
  await expect(page.locator('#flappy-score')).toHaveText('00');
  await expect(page.locator('#flappy-best')).toHaveText(score);
  await page.reload();
  await expect(board).toHaveAttribute('data-state', 'ready');
  await expect(page.locator('#flappy-best')).toHaveText(score);
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
  await page.locator('#flappy-overlay-action').click();
  await page.clock.runFor(200);
  const position = await board.getAttribute('data-bird-y');
  await page.keyboard.press('r');
  await expect(page.getByRole('dialog')).toBeVisible();
  await page.clock.runFor(3000);
  await expect(board).toHaveAttribute('data-bird-y', position!);
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog')).toBeHidden();
  await expect(board).toHaveAttribute('data-state', 'playing');
  await page.locator('#flappy-restart').click();
  await page.evaluate(() => window.dispatchEvent(new Event('blur')));
  await page.getByRole('button', { name: '继续本局', exact: true }).click();
  await expect(board).toHaveAttribute('data-state', 'paused');
  await page.keyboard.press('p');
  await expect(board).toHaveAttribute('data-state', 'playing');
  await page.evaluate(() => window.dispatchEvent(new Event('blur')));
  await expect(board).toHaveAttribute('data-state', 'paused');
  await page.clock.runFor(1000);
  await expect(board).toHaveAttribute('data-bird-y', position!);
  await page.locator('#flappy-restart').click();
  await page.getByRole('button', { name: '确定重开', exact: true }).click();
  await expect(board).toHaveAttribute('data-state', 'ready');
  await expect(board).toHaveAttribute('data-bird-y', '254');
  await expect(page.locator('.flight-time')).toHaveText('00:00');
  await expect(page.locator('#flappy-restart')).toBeDisabled();
  await page.locator('#flappy-start').click();
  await page.getByRole('link', { name: '返回大厅' }).click();
  await page.clock.runFor(5000);
  await expect(board).toHaveCount(0);
  await page.getByRole('link', { name: '开始玩Flappy Bird', exact: true }).click();
  await expect(board).toHaveAttribute('data-state', 'ready');
  expect(errors).toEqual([]);
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
  await page.clock.runFor(32);
  const canvas = page.locator(`${boardSelector} canvas`);
  const picture = await canvas.evaluate(canvas => (canvas as HTMLCanvasElement).toDataURL());
  await page.clock.runFor(2000);
  expect(await canvas.evaluate(canvas => (canvas as HTMLCanvasElement).toDataURL())).toBe(picture);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.locator('#flappy-overlay-action').click();
  await page.clock.runFor(2000);
  await expect(page.locator(boardSelector)).toHaveAttribute('data-state', 'over');
  await page.screenshot({ path: testInfo.outputPath('narrow-over.png'), fullPage: true });
  await page.locator('#flappy-overlay-action').click();
  await expect(page.locator(boardSelector)).toHaveAttribute('data-state', 'playing');
});
