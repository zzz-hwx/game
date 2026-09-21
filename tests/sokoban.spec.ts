import { test, expect } from '@playwright/test';
import { LEVELS, SokobanGame } from '../src/games/sokoban/engine';
import type { Direction } from '../src/games/sokoban/engine';

const storageKey = 'little-break-sokoban-v1';
const arrows: Record<Direction, string> = { up: 'ArrowUp', down: 'ArrowDown', left: 'ArrowLeft', right: 'ArrowRight' };
const labels: Record<Direction, string> = { up: '向上移动', down: '向下移动', left: '向左移动', right: '向右移动' };
const firstMove = (Object.keys(arrows) as Direction[]).find(direction => new SokobanGame().move(direction))!;

test.beforeEach(async ({ page }) => {
  await page.goto('/#/games/sokoban');
  await expect(page.locator('.sokoban-board')).toBeVisible();
});

test('推箱子移动、撤销、重开确认和自由选关', async ({ page }) => {
  const board = page.locator('.sokoban-board');
  const initialPlayer = await page.locator('.player-piece').getAttribute('data-cell');
  await expect(page.locator('#sokoban-undo')).toBeDisabled();
  await board.focus();
  await page.keyboard.press(arrows[firstMove]);
  await expect(page.locator('#sokoban-moves')).toHaveText('01');
  await expect(page.locator('.player-piece')).not.toHaveAttribute('data-cell', initialPlayer!);
  await page.keyboard.press('z');
  await expect(page.locator('#sokoban-moves')).toHaveText('00');
  await expect(page.locator('.player-piece')).toHaveAttribute('data-cell', initialPlayer!);
  await page.keyboard.press(arrows[firstMove]);
  await page.keyboard.press('r');
  await expect(page.getByRole('dialog')).toBeVisible();
  await page.keyboard.press(arrows[firstMove]);
  await expect(page.locator('#sokoban-moves')).toHaveText('01');
  await page.getByRole('button', { name: '继续本关', exact: true }).click();
  await expect(page.locator('#sokoban-moves')).toHaveText('01');
  await page.locator('#sokoban-restart').click();
  await page.getByRole('button', { name: '确定重开', exact: true }).click();
  await expect(page.locator('#sokoban-moves')).toHaveText('00');
  await expect(page.locator('#sokoban-undo')).toBeDisabled();
  await page.keyboard.press(arrows[firstMove]);
  await page.locator('[data-level="1"]').click();
  await expect(page.getByRole('dialog')).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.locator('[data-level="0"]')).toHaveAttribute('aria-current', 'step');
  await page.locator('[data-level="1"]').click();
  await page.getByRole('button', { name: '确定切换', exact: true }).click();
  await expect(page.locator('[data-level="1"]')).toHaveAttribute('aria-current', 'step');
  await expect(page.locator('#sokoban-moves')).toHaveText('00');
  await page.reload();
  await expect(page.locator('[data-level="1"]')).toHaveAttribute('aria-current', 'step');
  await page.getByRole('button', { name: /需要一点小灵感/ }).click();
  await expect(page.locator('#sokoban-hint')).toHaveText(LEVELS[1].hint);
  await page.locator('[data-level="7"]').click();
  await expect(page.locator('#sokoban-hint')).toHaveCount(0);
  await expect(page.locator('.board-heading h2')).toHaveText(LEVELS[7].name);
});

test('推箱子真实滑动、轻触、取消手势和方向按钮', async ({ page, isMobile }) => {
  const board = page.locator('.sokoban-board');
  await board.scrollIntoViewIfNeeded();
  const box = (await board.boundingBox())!;
  const x = box.x + box.width / 2;
  const y = box.y + box.height / 2;
  const dx = firstMove === 'left' ? -60 : firstMove === 'right' ? 60 : 0;
  const dy = firstMove === 'up' ? -60 : firstMove === 'down' ? 60 : 0;
  if (isMobile) {
    const client = await page.context().newCDPSession(page);
    await client.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y }] });
    await client.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    await expect(page.locator('#sokoban-moves')).toHaveText('00');
    await client.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y }] });
    await client.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: x + dx, y: y + dy }] });
    await client.send('Input.dispatchTouchEvent', { type: 'touchCancel', touchPoints: [] });
    await expect(page.locator('#sokoban-moves')).toHaveText('00');
    await client.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y }] });
    await client.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: x + dx, y: y + dy }] });
    await client.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    await client.detach();
  } else {
    await page.mouse.click(x, y);
    await expect(page.locator('#sokoban-moves')).toHaveText('00');
    await page.mouse.move(x, y);
    await page.mouse.down();
    await page.mouse.move(x + dx, y + dy, { steps: 5 });
    await page.mouse.up();
  }
  await expect(page.locator('#sokoban-moves')).toHaveText('01');
  await page.locator('#sokoban-undo').click();
  const control = page.getByRole('button', { name: labels[firstMove], exact: true });
  if (isMobile) await control.tap();
  else await control.click();
  await expect(page.locator('#sokoban-moves')).toHaveText('01');
  await page.keyboard.press('z');
  await expect(page.locator('#sokoban-moves')).toHaveText('00');
});

test('推箱子拒绝损坏纪录，存储不可用时仍能游玩', async ({ page }) => {
  for (const raw of ['{', 'null', JSON.stringify({ version: 1, levelIndex: -1, best: [true, -5, '3', 0, {}, null] })]) {
    await page.evaluate(({ storageKey, raw }) => localStorage.setItem(storageKey, raw), { storageKey, raw });
    await page.reload();
    await expect(page.locator('[data-level="0"]')).toHaveAttribute('aria-current', 'step');
    await expect(page.locator('#sokoban-best')).toHaveText('—');
    await expect(page.locator('.level-buttons .completed')).toHaveCount(0);
  }
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.addInitScript(() => {
    Storage.prototype.getItem = () => { throw new DOMException('Storage blocked', 'SecurityError'); };
    Storage.prototype.setItem = () => { throw new DOMException('Storage blocked', 'SecurityError'); };
  });
  await page.reload();
  await expect(page.locator('.save-note')).toHaveText('浏览器存储不可用，仍可正常游玩');
  await page.locator('.sokoban-board').focus();
  await page.keyboard.press(arrows[firstMove]);
  await expect(page.locator('#sokoban-moves')).toHaveText('01');
  await page.locator('#sokoban-undo').click();
  await page.locator('[data-level="1"]').click();
  await expect(page.locator('[data-level="1"]')).toHaveAttribute('aria-current', 'step');
  expect(errors).toEqual([]);
});

test('推箱子八关均可真实通关，撤销和最后一关回到起点', async ({ page }) => {
  const solutions = [
    'UULUR', 'LUUDDRRUU', 'ULURDDRRUUUDDDLLUURURD', 'UUULURRRLLDDRRURD',
    'UUUDDRRUUDDLLURDRRUULDLDR', 'LDDRRUDDDRRURUUULLLRRDDL',
    'URUUUULLLLLDDRDRUUDDRUUDRDLLLDURRRDULLLDLDRUURRRDRDL',
    'UULUDDDRRRRUUUULLLLULLDDDRLUUURRDDDRDRUUDLLUURRDDLUDDL',
  ];
  const codes: Record<string, string> = { U: 'ArrowUp', D: 'ArrowDown', L: 'ArrowLeft', R: 'ArrowRight' };
  for (const [index, solution] of solutions.entries()) {
    await page.locator('.sokoban-board').focus();
    for (const code of solution) await page.keyboard.press(codes[code]);
    await expect(page.locator('.win-overlay')).toBeVisible();
    await expect(page.locator('.sokoban-board')).toHaveAttribute('data-state', 'won');
    await expect(page.locator('#sokoban-moves')).toHaveText(String(solution.length).padStart(2, '0'));
    await expect(page.locator('#sokoban-best')).toHaveText(String(solution.length));
    await expect(page.locator('.level-buttons .completed')).toHaveCount(index + 1);
    await page.locator('#sokoban-undo').click();
    await expect(page.locator('.win-overlay')).toBeHidden();
    await expect(page.locator('#sokoban-best')).toHaveText(String(solution.length));
    await page.keyboard.press(codes[solution.at(-1)!]);
    await page.locator('.win-overlay .primary-button').click();
    await expect(page.locator('[aria-current="step"]')).toHaveAttribute('data-level', String((index + 1) % LEVELS.length));
  }
  await page.reload();
  await expect(page.locator('.level-buttons .completed')).toHaveCount(8);
  await expect(page.locator('.journey-progress')).toHaveAttribute('aria-valuenow', '8');
});

test('推箱子更新更少步数的纪录，并提示角落卡死而不结束游戏', async ({ page }) => {
  await page.locator('.sokoban-board').focus();
  await page.keyboard.press('ArrowDown');
  await expect(page.locator('#sokoban-moves')).toHaveText('00');
  for (const key of ['w', 'w', 'd', 'w', 'a']) await page.keyboard.press(key);
  await expect(page.locator('.board-status')).toHaveClass(/warning/);
  await expect(page.locator('.sokoban-board')).toHaveAttribute('data-state', 'playing');
  await page.keyboard.press('z');
  await expect(page.locator('.board-status')).not.toHaveClass(/warning/);
  await page.locator('#sokoban-restart').click();
  await page.getByRole('button', { name: '确定重开', exact: true }).click();
  for (const key of ['w', 'a', 'w', 'd', 's', 'd', 'w']) await page.keyboard.press(key);
  await expect(page.locator('#sokoban-best')).toHaveText('7');
  await page.reload();
  await expect(page.locator('#sokoban-best')).toHaveText('7');
  await page.locator('.sokoban-board').focus();
  for (const key of ['w', 'w', 'a', 'w', 'd']) await page.keyboard.press(key);
  await expect(page.locator('#sokoban-best')).toHaveText('5');
  await expect(page.locator('.win-overlay')).toBeVisible();
  await page.getByRole('link', { name: '返回大厅' }).click();
  await page.keyboard.press('ArrowUp');
  await expect(page.locator('.lobby')).toBeVisible();
  await page.getByRole('link', { name: '开始玩推箱子', exact: true }).click();
  await expect(page.locator('#sokoban-best')).toHaveText('5');
  await expect(page.locator('#sokoban-moves')).toHaveText('00');
});

test('推箱子各屏幕宽度下棋盘、导航和按钮不溢出', async ({ page, isMobile }, testInfo) => {
  for (const width of isMobile ? [320, 393] : [768, 1024, 1440]) {
    await page.setViewportSize({ width, height: 1000 });
    for (const levelIndex of [0, 7]) {
      await page.locator(`[data-level="${levelIndex}"]`).click();
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
      const board = (await page.locator('.sokoban-board').boundingBox())!;
      expect(board.x).toBeGreaterThanOrEqual(0);
      expect(board.x + board.width).toBeLessThanOrEqual(width);
      await expect(page.locator('#sokoban-restart')).toBeVisible();
    }
    await page.screenshot({ path: testInfo.outputPath(`sokoban-${width}.png`), fullPage: true });
  }
});
