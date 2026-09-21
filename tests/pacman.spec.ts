import { test, expect } from '@playwright/test';
import type { Page } from '@playwright/test';
import { PacmanGame } from '../src/games/pacman/engine';
import type { Direction } from '../src/games/pacman/engine';

const keys: Record<Direction, string> = { up: 'ArrowUp', left: 'ArrowLeft', down: 'ArrowDown', right: 'ArrowRight' };

async function advanceOneTick(page: Page): Promise<void> {
  const board = page.locator('.pacman-board');
  const ticks = await board.getAttribute('data-ticks');
  for (let i = 0; i < 12 && await board.getAttribute('data-ticks') === ticks; i++) await page.clock.runFor(16);
  expect(await board.getAttribute('data-ticks')).not.toBe(ticks);
}

function routeTo(target: number): Direction[] {
  const game = new PacmanGame();
  const queue = [{ cell: game.player, route: [] as Direction[] }];
  const seen = new Set([game.player]);
  for (const item of queue) {
    if (item.cell === target) return item.route;
    for (const direction of Object.keys(keys) as Direction[]) {
      const cell = game.neighbor(item.cell, direction);
      if (cell !== null && !seen.has(cell)) {
        seen.add(cell);
        queue.push({ cell, route: [...item.route, direction] });
      }
    }
  }
  throw new Error(`No route to ${target}`);
}

test.beforeEach(async ({ page }) => {
  const time = new Date('2026-09-21T12:00:00Z');
  await page.clock.install({ time });
  await page.clock.pauseAt(new Date(time.getTime() + 1000));
  await page.goto('/#/games/pacman');
  await expect(page.locator('.pacman-board')).toHaveAttribute('data-state', 'ready');
});

test('开始、吃豆、暂停与重开，最高分刷新保留', async ({ page }) => {
  const board = page.locator('.pacman-board');
  const initial = await page.locator('#pacman-remaining').textContent();
  await page.locator('#pacman-overlay-action').click();
  await advanceOneTick(page);
  await expect(page.locator('#pacman-score')).toHaveText('0010');
  expect(Number(await page.locator('#pacman-remaining').textContent())).toBe(Number(initial) - 1);
  await page.keyboard.press('Space');
  await expect(board).toHaveAttribute('data-state', 'paused');
  const position = await board.getAttribute('data-player');
  await page.clock.runFor(5000);
  await page.keyboard.press('ArrowRight');
  await expect(board).toHaveAttribute('data-player', position!);
  await expect(page.locator('#pacman-score')).toHaveText('0010');
  await page.locator('#pacman-overlay-action').click();
  await advanceOneTick(page);
  await expect(page.locator('#pacman-score')).toHaveText('0020');
  await page.locator('#pacman-restart').click();
  await expect(page.getByRole('dialog')).toBeVisible();
  await page.clock.runFor(1000);
  await page.getByRole('button', { name: '继续本局', exact: true }).click();
  await expect(board).toHaveAttribute('data-state', 'playing');
  await expect(page.locator('#pacman-score')).toHaveText('0020');
  await page.keyboard.press('KeyR');
  await page.getByRole('button', { name: '确定重开', exact: true }).click();
  await expect(board).toHaveAttribute('data-state', 'ready');
  await expect(page.locator('#pacman-score')).toHaveText('0000');
  await expect(page.locator('#pacman-remaining')).toHaveText(initial!);
  await expect(page.locator('#pacman-best')).toHaveText('0020');
  await page.reload();
  await expect(page.locator('#pacman-best')).toHaveText('0020');
});

test('提前转弯、碰墙停止，WASD 可直接开始', async ({ page }) => {
  const board = page.locator('.pacman-board');
  const spawn = Number(await board.getAttribute('data-player'));
  await board.focus();
  await page.keyboard.press('a');
  await advanceOneTick(page);
  await expect(board).toHaveAttribute('data-player', String(spawn - 1));
  await page.keyboard.press('s');
  await advanceOneTick(page);
  await expect(board).toHaveAttribute('data-player', String(spawn - 2));
  await advanceOneTick(page);
  await expect(board).toHaveAttribute('data-player', String(spawn - 3));
  await advanceOneTick(page);
  await expect(board).toHaveAttribute('data-player', String(spawn - 3 + 19));
  await advanceOneTick(page);
  const stopped = await board.getAttribute('data-player');
  await advanceOneTick(page);
  await expect(board).toHaveAttribute('data-player', stopped!);
});

test('能量豆可收集，暂停冻结能量时间', async ({ page }) => {
  const game = new PacmanGame();
  const destination = 19 * 19 + 1;
  const route = routeTo(destination);
  await page.locator('#pacman-overlay-action').click();
  for (const direction of route) {
    await page.keyboard.press(keys[direction]);
    await advanceOneTick(page);
  }
  await expect(page.locator('.pacman-board')).toHaveAttribute('data-player', String(destination));
  await expect(page.locator('.pacman-board')).toHaveAttribute('data-power', '40');
  await expect(page.locator('.power-card')).toHaveClass(/active/);
  await expect(page.locator('#pacman-score')).toHaveText(String((route.length - 1) * 10 + 50).padStart(4, '0'));
  await page.keyboard.press('Space');
  await page.clock.runFor(10000);
  await expect(page.locator('.pacman-board')).toHaveAttribute('data-power', '40');
  expect(game.powerPellets.has(destination)).toBe(true);
});

test('幽灵追逐会掉命，最后一次结束后可以重玩', async ({ page }) => {
  await page.locator('#pacman-overlay-action').click();
  for (let lives = 2; lives >= 0; lives--) {
    await page.clock.runFor(5000);
    await expect(page.locator('.lives')).toHaveAttribute('data-lives', String(lives));
    await expect(page.locator('.pacman-board')).toHaveAttribute('data-state', lives ? 'life-lost' : 'over');
    await page.locator('#pacman-overlay-action').click();
  }
  await expect(page.locator('.pacman-board')).toHaveAttribute('data-state', 'playing');
  await expect(page.locator('.lives')).toHaveAttribute('data-lives', '3');
  await expect(page.locator('#pacman-score')).toHaveText('0000');
});

test('离开焦点自动暂停，取消重开和退出清理正常', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.locator('#pacman-start').click();
  await advanceOneTick(page);
  await page.evaluate(() => window.dispatchEvent(new Event('blur')));
  await expect(page.locator('.pacman-board')).toHaveAttribute('data-state', 'paused');
  await page.locator('#pacman-restart').click();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog')).toBeHidden();
  await expect(page.locator('.pacman-board')).toHaveAttribute('data-state', 'paused');
  await page.getByRole('link', { name: '返回大厅' }).click();
  await page.clock.runFor(60000);
  await expect(page.locator('.pacman-game')).toHaveCount(0);
  await page.getByRole('link', { name: '开始玩吃豆人', exact: true }).click();
  await expect(page.locator('.pacman-board')).toHaveAttribute('data-state', 'ready');
  await expect(page.locator('#pacman-best')).toHaveText('0010');
  expect(errors).toEqual([]);
});

test('存储不可用不影响游戏，损坏纪录安全忽略', async ({ page }) => {
  await page.evaluate(() => localStorage.setItem('little-break-pacman-best-v1', '-10'));
  await page.reload();
  await expect(page.locator('#pacman-best')).toHaveText('0000');
  await page.addInitScript(() => {
    Storage.prototype.getItem = () => { throw new DOMException('Storage blocked', 'SecurityError'); };
    Storage.prototype.setItem = () => { throw new DOMException('Storage blocked', 'SecurityError'); };
  });
  await page.reload();
  await expect(page.locator('.save-note')).toContainText('浏览器存储不可用');
  await page.locator('#pacman-overlay-action').click();
  await advanceOneTick(page);
  await expect(page.locator('#pacman-score')).toHaveText('0010');
  await expect(page.locator('#pacman-best')).toHaveText('0010');
});

test('方向按钮和手机滑动可控制，页面无横向溢出', async ({ page, isMobile }, testInfo) => {
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: testInfo.outputPath('ready.png'), fullPage: true });
  const button = page.getByRole('button', { name: '向右移动', exact: true });
  if (isMobile) await button.tap();
  else await button.click();
  await advanceOneTick(page);
  const first = Number(await page.locator('.pacman-board').getAttribute('data-player'));
  await expect(page.locator('#pacman-score')).toHaveText('0010');
  await page.locator('.pacman-board').scrollIntoViewIfNeeded();
  const bounds = (await page.locator('.pacman-board').boundingBox())!;
  const x = bounds.x + bounds.width / 2;
  const y = bounds.y + bounds.height / 2;
  if (isMobile) {
    const session = await page.context().newCDPSession(page);
    await session.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y }] });
    await session.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: x - 70, y }] });
    await session.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    await session.detach();
  } else {
    await page.mouse.move(x, y);
    await page.mouse.down();
    await page.mouse.move(x - 70, y);
    await page.mouse.up();
  }
  await advanceOneTick(page);
  await expect(page.locator('.pacman-board')).toHaveAttribute('data-player', String(first - 1));
  await page.screenshot({ path: testInfo.outputPath('playing.png'), fullPage: true });
});
