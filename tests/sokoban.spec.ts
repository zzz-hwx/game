import { test, expect } from '@playwright/test';
import type { Page } from '@playwright/test';
import { LEVELS, SokobanGame } from '../src/games/sokoban/engine';
import type { Direction } from '../src/games/sokoban/engine';

const storageKey = 'little-break-sokoban-v1';
const arrows: Record<Direction, string> = { up: 'ArrowUp', down: 'ArrowDown', left: 'ArrowLeft', right: 'ArrowRight' };
const labels: Record<Direction, string> = { up: '向上移动', down: '向下移动', left: '向左移动', right: '向右移动' };
const firstMove = (Object.keys(arrows) as Direction[]).find(direction => new SokobanGame().move(direction))!;

async function readBoard(page: Page) {
  return {
    level: await page.locator('[aria-current="step"]').getAttribute('data-level'),
    player: await page.locator('.player-piece').getAttribute('data-cell'),
    boxes: await page.locator('.box-piece').evaluateAll(elements => elements.map(element => element.getAttribute('data-cell'))),
    moves: await page.locator('#sokoban-moves').textContent(),
    pushes: await page.locator('#sokoban-pushes').textContent(),
  };
}

async function walk(page: Page, path: string) {
  const codes: Record<string, string> = { U: 'ArrowUp', D: 'ArrowDown', L: 'ArrowLeft', R: 'ArrowRight' };
  await page.locator('.sokoban-board').focus();
  for (const code of path) await page.keyboard.press(codes[code]);
}

async function expectTextMap(page: Page, game: SokobanGame) {
  const table = page.getByRole('table');
  const columns = ['行 / 列', ...Array.from({ length: game.width }, (_, column) => `第 ${column + 1} 列`)];
  const rows = Array.from({ length: game.height }, (_, row) => [
    `第 ${row + 1} 行`,
    ...Array.from({ length: game.width }, (_, column) => {
      const index = row * game.width + column;
      let text = game.cells[index] === 'wall' ? '墙体' : game.cells[index] === 'goal' ? '目标（地面）' : '地面';
      if (game.player === index) text += '，玩家';
      if (game.boxes.includes(index)) text += '，箱子';
      return text;
    }),
  ]);
  await expect(table).toHaveAccessibleName(`第 ${game.levelIndex + 1} 关：${LEVELS[game.levelIndex].name} · ${game.height} 行 × ${game.width} 列`);
  await expect(table.getByRole('columnheader')).toHaveText(columns);
  await expect(table.getByRole('rowheader')).toHaveText(rows.map(row => row[0]));
  await expect.poll(() => table.getByRole('row').evaluateAll(elements => elements.map(row =>
    Array.from(row.children, cell => cell.textContent?.trim()),
  ))).toEqual([columns, ...rows]);
}

test.beforeEach(async ({ page }) => {
  await page.goto('/#/games/sokoban');
  await expect(page.locator('.sokoban-board')).toBeVisible();
});

test('推箱子文字地图可键盘展开折叠，阅读快捷键不走棋', async ({ page }) => {
  const map = page.locator('.text-map');
  const summary = map.locator('summary');
  const region = page.getByRole('region', { name: '文字地图，可横向滚动' });
  await expect(summary).toHaveText('查看文字地图');
  await expect(map).not.toHaveAttribute('open');
  await expect(page.getByRole('table')).toHaveCount(0);
  await walk(page, 'U');
  const initial = await readBoard(page);
  const announcement = await page.getByRole('status').textContent();
  await page.keyboard.press('Tab');
  await expect(summary).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(map).toHaveAttribute('open');
  await expect(page.getByRole('table')).toBeVisible();
  await expect(page.locator('#sokoban-map-help')).toBeVisible();
  await expect(region).toHaveAccessibleDescription(/阅读文字地图时，方向键、WASD、Z、R 不会控制游戏/);
  for (const target of [summary, region]) {
    await expect(target).toBeFocused();
    for (const key of [...Object.values(arrows), 'w', 'a', 's', 'd', 'z', 'r']) {
      await page.keyboard.press(key);
      expect(await readBoard(page)).toEqual(initial);
      await expect(page.getByRole('dialog')).not.toBeVisible();
    }
    if (target === summary) await page.keyboard.press('Tab');
  }
  await page.keyboard.press('Shift+Tab');
  await expect(summary).toBeFocused();
  await page.keyboard.press('Space');
  await expect(map).not.toHaveAttribute('open');
  await expect(page.getByRole('table')).toHaveCount(0);
  await page.keyboard.press('Space');
  await expect(page.getByRole('table')).toBeVisible();
  await page.keyboard.press('Enter');
  await expect(map).not.toHaveAttribute('open');
  expect(await readBoard(page)).toEqual(initial);
  await expect(page.getByRole('status')).toHaveText(announcement!);
  await page.locator('.sokoban-board').focus();
  await page.keyboard.press('z');
  await expect(page.locator('#sokoban-moves')).toHaveText('00');
});

test('推箱子文字地图逐坐标匹配全部初始关卡，包含内墙与目标叠加', async ({ page }) => {
  await page.locator('.text-map summary').click();
  for (let index = 0; index < LEVELS.length; index++) {
    await page.locator(`[data-level="${index}"]`).click();
    await expectTextMap(page, new SokobanGame(index));
  }
});

test('推箱子文字地图随走位、箱子归位、撤销、重开和选关更新', async ({ page }) => {
  const game = new SokobanGame();
  await page.locator('.text-map summary').click();
  for (const direction of ['up', 'up', 'left', 'up', 'right'] as Direction[]) {
    expect(game.move(direction)).toBe(true);
    await walk(page, { up: 'U', down: 'D', left: 'L', right: 'R' }[direction]);
    await expectTextMap(page, game);
  }
  await expect(page.getByRole('cell', { name: '目标（地面），箱子', exact: true })).toHaveCount(1);
  await page.locator('#sokoban-undo').click();
  game.undo();
  await expectTextMap(page, game);
  await page.locator('#sokoban-restart').click();
  await page.getByRole('button', { name: '确定重开', exact: true }).click();
  game.restart();
  await expectTextMap(page, game);
  await page.locator('.text-map summary').click();
  await walk(page, 'U');
  game.move('up');
  await expect(page.getByRole('table')).toHaveCount(0);
  await page.locator('.text-map summary').click();
  await expectTextMap(page, game);
  await page.locator('[data-level="7"]').click();
  await page.getByRole('button', { name: '确定切换', exact: true }).click();
  game.loadLevel(7);
  await expectTextMap(page, game);
});

test('推箱子文字地图保留玩家脚下目标，箱子移出目标和撤销后准确', async ({ page }) => {
  const game = new SokobanGame(5);
  await page.locator('[data-level="5"]').click();
  await page.locator('.text-map summary').click();
  await expectTextMap(page, game);
  await expect(page.getByRole('cell', { name: '目标（地面），玩家', exact: true })).toHaveCount(1);
  for (const direction of ['left', 'down', 'down', 'right', 'right'] as Direction[]) game.move(direction);
  await walk(page, 'LDDRR');
  await expectTextMap(page, game);
  await expect(page.getByRole('cell', { name: '目标（地面），玩家', exact: true })).toHaveCount(1);
  await expect(page.getByRole('cell', { name: '目标（地面），箱子', exact: true })).toHaveCount(0);
  await page.locator('#sokoban-undo').click();
  game.undo();
  await expectTextMap(page, game);
  await expect(page.getByRole('cell', { name: '目标（地面），箱子', exact: true })).toHaveCount(1);
  await page.locator('#sokoban-restart').click();
  await page.getByRole('button', { name: '确定重开', exact: true }).click();
  game.restart();
  await expectTextMap(page, game);
});

test('推箱子文字地图不参与每步 live 播报，保留精简位置说明', async ({ page }) => {
  const game = new SokobanGame();
  await page.locator('.text-map summary').click();
  for (const direction of ['up', 'up', 'left'] as Direction[]) {
    game.move(direction);
    await walk(page, direction === 'up' ? 'U' : 'L');
    await expectTextMap(page, game);
    const description = `你在第 ${Math.floor(game.player / game.width) + 1} 行、第 ${game.player % game.width + 1} 列。` +
      game.boxes.map((cell, index) => `箱子 ${index + 1} 在第 ${Math.floor(cell / game.width) + 1} 行、第 ${cell % game.width + 1} 列${game.cells[cell] === 'goal' ? '，已归位' : ''}。`).join('') +
      `目标位置：${game.goals.map(cell => `${Math.floor(cell / game.width) + 1} 行 ${cell % game.width + 1} 列`).join('、')}。`;
    await expect(page.locator('.tile-grid')).toHaveAccessibleName(description);
    await expect(page.getByRole('status')).toHaveText(`第 ${game.moves} 步，已归位 ${game.placed} / ${game.boxes.length} 个箱子。${description}`);
  }
  expect(await page.getByRole('table').evaluate(table => {
    const live = '[aria-live]:not([aria-live="off"]), [role="status"], [role="alert"], [role="log"]';
    return !!table.closest(live) || !!table.querySelector(live);
  })).toBe(false);
  await expect(page.locator('.sokoban-game [aria-live]')).toHaveCount(1);
  await expect(page.getByRole('status')).not.toContainText(/墙体|地面|查看文字地图/);
});

test('推箱子文字地图窄屏局部横向滚动，字号与对比度可读', async ({ page }) => {
  await page.locator('[data-level="7"]').click();
  await page.locator('.text-map summary').click();
  const region = page.getByRole('region', { name: '文字地图，可横向滚动' });
  const initial = await readBoard(page);
  for (const width of [320, 393]) {
    await page.setViewportSize({ width, height: 900 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    expect(await region.evaluate(element => element.scrollWidth > element.clientWidth)).toBe(true);
    const bounds = (await region.boundingBox())!;
    expect(bounds.x).toBeGreaterThanOrEqual(0);
    expect(bounds.x + bounds.width).toBeLessThanOrEqual(width);
    await region.evaluate(element => { element.scrollLeft = 0; });
    await region.focus();
    await page.keyboard.press('ArrowRight');
    await expect.poll(() => region.evaluate(element => element.scrollLeft)).toBeGreaterThan(0);
    expect(await readBoard(page)).toEqual(initial);
  }
  const styles = await page.locator('.text-map').evaluate(map => {
    function luminance(color: string) {
      const [r, g, b] = color.match(/[\d.]+/g)!.slice(0, 3).map(value => {
        const channel = Number(value) / 255;
        return channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4;
      });
      return .2126 * r + .7152 * g + .0722 * b;
    }
    return Array.from(map.querySelectorAll('summary, p, caption, th, td'), element => {
      const style = getComputedStyle(element);
      let background: Element = element;
      while (getComputedStyle(background).backgroundColor === 'rgba(0, 0, 0, 0)' && background.parentElement) background = background.parentElement;
      const foreground = luminance(style.color);
      const backdrop = luminance(getComputedStyle(background).backgroundColor);
      return { size: parseFloat(style.fontSize), contrast: (Math.max(foreground, backdrop) + .05) / (Math.min(foreground, backdrop) + .05) };
    });
  });
  expect(Math.min(...styles.map(style => style.size))).toBeGreaterThanOrEqual(16);
  expect(Math.min(...styles.map(style => style.contrast))).toBeGreaterThanOrEqual(4.5);
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

test('推箱子跨页合并不同关卡纪录，不写回或重置本局与撤销', async ({ page, context }) => {
  const initial = await readBoard(page);
  await walk(page, 'U');
  const ownBoard = await readBoard(page);
  const other = await context.newPage();
  await other.goto('/#/games/sokoban');
  await page.evaluate(() => {
    Reflect.set(window, '__recordWrites', 0);
    const set = Storage.prototype.setItem;
    Storage.prototype.setItem = function (key, value) {
      Reflect.set(window, '__recordWrites', Reflect.get(window, '__recordWrites') + 1);
      return set.call(this, key, value);
    };
  });
  await walk(other, 'UULUR');
  await expect(other.locator('.win-overlay')).toBeVisible();
  await expect(page.locator('#sokoban-best')).toHaveText('5');
  expect(await readBoard(page)).toEqual(ownBoard);
  expect(await page.evaluate(() => Reflect.get(window, '__recordWrites'))).toBe(0);
  await page.locator('#sokoban-undo').click();
  expect(await readBoard(page)).toEqual(initial);
  await expect(page.locator('#sokoban-best')).toHaveText('5');
  const otherBoard = await readBoard(other);
  await page.locator('[data-level="1"]').click();
  await walk(page, 'LUUDDRRUU');
  await expect(page.locator('#sokoban-best')).toHaveText('9');
  await expect(other.locator('.level-buttons .completed')).toHaveCount(2);
  expect(await readBoard(other)).toEqual(otherBoard);
  await expect(other.locator('#sokoban-best')).toHaveText('5');
  await expect(other.locator('#sokoban-undo')).toBeEnabled();
  expect(await page.evaluate(key => JSON.parse(localStorage.getItem(key)!), storageKey)).toEqual({
    version: 1, levelIndex: 1, best: [5, 9, ...LEVELS.slice(2).map(() => null)],
  });
  await other.locator('#sokoban-undo').click();
  await expect(other.locator('#sokoban-moves')).toHaveText('04');
  await expect(other.locator('.win-overlay')).toBeHidden();
  await other.close();
});

test('推箱子保存前逐关合并最新更少步数，即使跨页事件尚未处理', async ({ page, context }) => {
  // Register before mounting so the component cannot receive the pending events.
  await page.addInitScript(() => {
    Reflect.set(window, '__heldStorageEvents', 0);
    window.addEventListener('storage', event => {
      event.stopImmediatePropagation();
      Reflect.set(window, '__heldStorageEvents', Reflect.get(window, '__heldStorageEvents') + 1);
    }, true);
  });
  await page.reload();
  await walk(page, 'ULURDRU');
  await expect(page.locator('#sokoban-best')).toHaveText('7');
  const other = await context.newPage();
  await other.goto('/#/games/sokoban');
  await walk(other, 'UULUR');
  await other.locator('[data-level="1"]').click();
  await walk(other, 'LUUDDRRUU');
  await expect(other.locator('#sokoban-best')).toHaveText('9');
  await expect.poll(() => page.evaluate(() => Reflect.get(window, '__heldStorageEvents'))).toBe(3);
  await expect(page.locator('#sokoban-best')).toHaveText('7');
  await expect(page.locator('.level-buttons .completed')).toHaveCount(1);
  const otherBoard = await readBoard(other);
  await page.locator('#sokoban-restart').click();
  await expect(page.locator('#sokoban-best')).toHaveText('5');
  await expect(page.locator('.level-buttons .completed')).toHaveCount(2);
  await expect(page.locator('#sokoban-moves')).toHaveText('00');
  expect(await page.evaluate(key => JSON.parse(localStorage.getItem(key)!), storageKey)).toEqual({
    version: 1, levelIndex: 0, best: [5, 9, ...LEVELS.slice(2).map(() => null)],
  });
  expect(await readBoard(other)).toEqual(otherBoard);
  await other.close();
});

test('推箱子跨页记录只接受正安全整数，损坏或删除不抹掉逐关纪录', async ({ page, context }) => {
  await walk(page, 'U');
  const ownBoard = await readBoard(page);
  await page.evaluate(() => {
    Reflect.set(window, '__storageEvents', 0);
    window.addEventListener('storage', () => {
      Reflect.set(window, '__storageEvents', Reflect.get(window, '__storageEvents') + 1);
    });
  });
  const other = await context.newPage();
  await other.goto('/');
  const cases = [
    { raw: '{', expected: '—', completed: 0 },
    { raw: 'null', expected: '—', completed: 0 },
    { raw: JSON.stringify({ version: 2, levelIndex: 7, best: [1] }), expected: '—', completed: 0 },
    { raw: JSON.stringify({ version: 1, best: [0, 1.5, true, '3', -1, Number.MAX_SAFE_INTEGER + 1, {}, null] }), expected: '—', completed: 0 },
    { raw: JSON.stringify({ version: 1, levelIndex: 7, best: [7, 11] }), expected: '7', completed: 2 },
    { raw: JSON.stringify({ version: 1, levelIndex: 3, best: [9, null, 8] }), expected: '7', completed: 3 },
    { raw: JSON.stringify({ version: 1, levelIndex: 1, best: [5, 13] }), expected: '5', completed: 3 },
    { raw: null, expected: '5', completed: 3 },
  ];
  for (const [index, { raw, expected, completed }] of cases.entries()) {
    await other.evaluate(({ key, raw }) => {
      if (raw === null) localStorage.removeItem(key);
      else localStorage.setItem(key, raw);
    }, { key: storageKey, raw });
    await expect.poll(() => page.evaluate(() => Reflect.get(window, '__storageEvents'))).toBe(index + 1);
    await expect(page.locator('#sokoban-best')).toHaveText(expected);
    await expect(page.locator('.level-buttons .completed')).toHaveCount(completed);
  }
  expect(await readBoard(page)).toEqual(ownBoard);
  await page.locator('#sokoban-undo').click();
  await expect(page.locator('#sokoban-moves')).toHaveText('00');
  await page.locator('#sokoban-restart').click();
  expect(await page.evaluate(key => JSON.parse(localStorage.getItem(key)!), storageKey)).toEqual({
    version: 1, levelIndex: 0, best: [5, 11, 8, ...LEVELS.slice(3).map(() => null)],
  });
  await other.close();
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
