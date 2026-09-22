import { test, expect } from '@playwright/test';
import type { Page } from '@playwright/test';
import { Game2048, STORAGE_KEY } from '../src/games/2048/engine';

const empty = Array<number>(12).fill(0);
const deadBoard = [2, 4, 2, 4, 4, 2, 4, 2, 2, 4, 2, 4, 4, 2, 4, 2];

async function readBoard(page: Page) {
  return page.locator('.board-cell').evaluateAll((cells) => cells.map((cell) => Number(cell.getAttribute('data-value'))));
}

async function seed(page: Page, board: number[], score = 0, moves = 0) {
  await page.evaluate(({ key, board, score, moves }) => {
    localStorage.setItem(key, JSON.stringify({ version: 1, board, score, moves, best: score, continued: false }));
  }, { key: STORAGE_KEY, board, score, moves });
  await page.reload();
  await expect(page.locator('.board-cell')).toHaveCount(16);
}

async function press(page: Page, key: string) {
  await page.locator('.number-board').focus();
  await page.keyboard.press(key);
  await expect(page.locator('.number-board')).toHaveAttribute('data-animating', 'false');
}

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => { Math.random = () => 0; });
  await page.goto('/#/games/2048');
  await expect(page.locator('.board-cell')).toHaveCount(16);
});

test('2048 开局、合并得分、无效移动与单步撤销', async ({ page }, testInfo) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await expect(page.locator('.number-tile')).toHaveCount(2);
  await expect(page.locator('#undo-2048')).toBeDisabled();
  await expect(page.locator('#score-2048')).toHaveText('0');
  await page.screenshot({ path: testInfo.outputPath('2048-ready.png'), fullPage: true });
  await press(page, 'ArrowLeft');
  expect(await readBoard(page)).toEqual([4, 2, 0, 0, ...empty]);
  await expect(page.locator('#score-2048')).toHaveText('4');
  await expect(page.locator('#moves-2048')).toHaveText('1');
  await expect(page.locator('#max-2048')).toHaveText('4');
  await press(page, 'ArrowUp');
  expect(await readBoard(page)).toEqual([4, 2, 0, 0, ...empty]);
  await expect(page.locator('#moves-2048')).toHaveText('1');
  await page.locator('#undo-2048').click();
  expect(await readBoard(page)).toEqual([2, 2, 0, 0, ...empty]);
  await expect(page.locator('#score-2048')).toHaveText('0');
  await expect(page.locator('#moves-2048')).toHaveText('0');
  await expect(page.locator('#best-2048')).toHaveText('4');
  await expect(page.locator('#undo-2048')).toBeDisabled();
  await expect(page.locator('.number-board')).toBeFocused();
  expect(errors).toEqual([]);
});

test('2048 方向键、WASD 和 Z 与引擎一致', async ({ page }) => {
  const engine = new Game2048(() => 0);
  const actions = [
    ['ArrowLeft', 'left'], ['ArrowDown', 'down'], ['ArrowRight', 'right'], ['ArrowUp', 'up'],
    ['a', 'left'], ['s', 'down'], ['d', 'right'], ['w', 'up'],
  ] as const;
  for (const [key, direction] of actions) {
    engine.move(direction);
    await press(page, key);
    expect(await readBoard(page)).toEqual(engine.board);
    await expect(page.locator('#score-2048')).toHaveText(engine.score.toLocaleString());
    await expect(page.locator('#moves-2048')).toHaveText(String(engine.moves));
  }
  engine.undo();
  await press(page, 'z');
  expect(await readBoard(page)).toEqual(engine.board);
  await page.getByRole('link', { name: '返回大厅' }).focus();
  await page.keyboard.press('ArrowLeft');
  expect(await readBoard(page)).toEqual(engine.board);
});

test('2048 刷新和返回大厅后恢复存档，路由离开后不再响应按键', async ({ page }) => {
  await press(page, 'ArrowLeft');
  await press(page, 'ArrowDown');
  const board = await readBoard(page);
  await page.reload();
  await expect(page.locator('#moves-2048')).toHaveText('2');
  expect(await readBoard(page)).toEqual(board);
  await expect(page.locator('#undo-2048')).toBeDisabled();
  const saved = await page.evaluate((key) => localStorage.getItem(key), STORAGE_KEY);
  await page.getByRole('link', { name: '返回大厅' }).click();
  await expect(page.locator('.lobby')).toBeVisible();
  await page.keyboard.press('ArrowLeft');
  await page.keyboard.press('z');
  expect(await page.evaluate((key) => localStorage.getItem(key), STORAGE_KEY)).toBe(saved);
  await page.getByRole('link', { name: '开始玩2048', exact: true }).click();
  await expect(page.locator('#moves-2048')).toHaveText('2');
  expect(await readBoard(page)).toEqual(board);
});

test('2048 重开确认支持取消、Escape、阻止误操作并保留纪录', async ({ page }) => {
  await press(page, 'ArrowLeft');
  const before = await readBoard(page);
  await page.locator('#restart-2048').click();
  await expect(page.getByRole('dialog')).toBeVisible();
  await page.keyboard.press('ArrowRight');
  await page.keyboard.press('z');
  expect(await readBoard(page)).toEqual(before);
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog')).not.toBeVisible();
  await page.locator('#restart-2048').click();
  await page.getByRole('button', { name: '继续本局', exact: true }).click();
  expect(await readBoard(page)).toEqual(before);
  await page.locator('#restart-2048').click();
  await page.getByRole('button', { name: '开始新的一局', exact: true }).click();
  await expect(page.locator('#moves-2048')).toHaveText('0');
  await expect(page.locator('#score-2048')).toHaveText('0');
  await expect(page.locator('#best-2048')).toHaveText('4');
  await expect(page.locator('.number-tile')).toHaveCount(2);
  await expect(page.locator('.number-board')).toBeFocused();
});

for (const cancel of ['button', 'Escape']) {
  test(`2048 取消重开后直接方向键继续移动：${cancel}`, async ({ page }) => {
    await press(page, 'ArrowLeft');
    await page.locator('#restart-2048').click();
    await expect(page.getByRole('dialog')).toBeVisible();
    if (cancel === 'Escape') await page.keyboard.press('Escape');
    else await page.getByRole('button', { name: '继续本局', exact: true }).click();
    await expect(page.getByRole('dialog')).toBeHidden();
    // Do not use press(): it focuses the board and would mask the regression.
    await page.keyboard.press('ArrowDown');
    await expect(page.locator('#moves-2048')).toHaveText('2');
    await expect(page.locator('.number-board')).toBeFocused();
  });
}

test('2048 跨页同步最高纪录不写回、不替换本局或撤销', async ({ page, context }) => {
  await press(page, 'ArrowLeft');
  const ownBoard = await readBoard(page);
  const other = await context.newPage();
  await other.addInitScript(() => { Math.random = () => 0; });
  await other.goto('/#/games/2048');
  await expect(other.locator('#moves-2048')).toHaveText('1');
  await page.evaluate(() => {
    Reflect.set(window, '__recordWrites', 0);
    const set = Storage.prototype.setItem;
    Storage.prototype.setItem = function (key, value) {
      Reflect.set(window, '__recordWrites', Reflect.get(window, '__recordWrites') + 1);
      return set.call(this, key, value);
    };
  });
  for (const key of ['ArrowDown', 'ArrowUp', 'ArrowLeft']) await press(other, key);
  await expect(other.locator('#score-2048')).toHaveText('8');
  await expect(page.locator('#best-2048')).toHaveText('8');
  expect(await readBoard(page)).toEqual(ownBoard);
  await expect(page.locator('#score-2048')).toHaveText('4');
  await expect(page.locator('#moves-2048')).toHaveText('1');
  await expect(page.locator('#undo-2048')).toBeEnabled();
  expect(await page.evaluate(() => Reflect.get(window, '__recordWrites'))).toBe(0);
  const otherBoard = await readBoard(other);
  await page.locator('#undo-2048').click();
  expect(await readBoard(page)).toEqual([2, 2, 0, 0, ...empty]);
  await expect(page.locator('#best-2048')).toHaveText('8');
  await press(page, 'ArrowLeft');
  await expect(page.locator('#best-2048')).toHaveText('8');
  expect(await readBoard(other)).toEqual(otherBoard);
  await expect(other.locator('#moves-2048')).toHaveText('4');
  await expect(other.locator('#undo-2048')).toBeEnabled();
  expect(await page.evaluate(key => JSON.parse(localStorage.getItem(key)!).best, STORAGE_KEY)).toBe(8);
  await other.close();
});

test('2048 保存前合并最新合法最高分，即使跨页事件尚未处理', async ({ page, context }) => {
  // Register before mounting so the component cannot receive the pending event.
  await page.addInitScript(() => {
    Reflect.set(window, '__heldStorageEvents', 0);
    window.addEventListener('storage', event => {
      event.stopImmediatePropagation();
      Reflect.set(window, '__heldStorageEvents', Reflect.get(window, '__heldStorageEvents') + 1);
    }, true);
  });
  await page.reload();
  await expect(page.locator('#best-2048')).toHaveText('0');
  const other = await context.newPage();
  await other.goto('/');
  await other.evaluate(key => localStorage.setItem(key, JSON.stringify({
    version: 1, board: [64, 64, ...Array(14).fill(0)], score: 256, moves: 30, continued: false, best: 512,
  })), STORAGE_KEY);
  await expect.poll(() => page.evaluate(() => Reflect.get(window, '__heldStorageEvents'))).toBe(1);
  await expect(page.locator('#best-2048')).toHaveText('0');
  await press(page, 'ArrowLeft');
  await expect(page.locator('#best-2048')).toHaveText('512');
  expect(await readBoard(page)).toEqual([4, 2, 0, 0, ...empty]);
  await expect(page.locator('#moves-2048')).toHaveText('1');
  expect(await page.evaluate(key => JSON.parse(localStorage.getItem(key)!), STORAGE_KEY)).toEqual({
    version: 1, board: [4, 2, 0, 0, ...empty], score: 4, moves: 1, continued: false, best: 512,
  });
  await page.locator('#undo-2048').click();
  expect(await readBoard(page)).toEqual([2, 2, 0, 0, ...empty]);
  await expect(page.locator('#best-2048')).toHaveText('512');
  await other.close();
});

test('2048 跨页记录严格校验版本与安全整数，损坏或删除不降低纪录', async ({ page, context }) => {
  await press(page, 'ArrowLeft');
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
    { raw: '{', expected: 4 },
    { raw: 'null', expected: 4 },
    { raw: JSON.stringify({ version: 2, best: 512, score: 1024 }), expected: 4 },
    ...[true, '512', -1, 0.5, Number.MAX_SAFE_INTEGER + 1, null, [], {}].map(value => ({
      raw: JSON.stringify({ version: 1, best: value, score: value }), expected: 4,
    })),
    { raw: JSON.stringify({ version: 1, best: 64, board: [3] }), expected: 64 },
    { raw: JSON.stringify({ version: 1, best: 0, score: 128 }), expected: 128 },
    { raw: null, expected: 128 },
  ];
  for (const [index, { raw, expected }] of cases.entries()) {
    await other.evaluate(({ key, raw }) => {
      if (raw === null) localStorage.removeItem(key);
      else localStorage.setItem(key, raw);
    }, { key: STORAGE_KEY, raw });
    await expect.poll(() => page.evaluate(() => Reflect.get(window, '__storageEvents'))).toBe(index + 1);
    await expect(page.locator('#best-2048')).toHaveText(String(expected));
  }
  expect(await readBoard(page)).toEqual(ownBoard);
  await expect(page.locator('#moves-2048')).toHaveText('1');
  await expect(page.locator('#score-2048')).toHaveText('4');
  await page.locator('#undo-2048').click();
  expect(await readBoard(page)).toEqual([2, 2, 0, 0, ...empty]);
  expect(await page.evaluate(key => JSON.parse(localStorage.getItem(key)!).best, STORAGE_KEY)).toBe(128);
  await other.close();
});

test('2048 合成目标、胜利提示、撤销胜利与继续挑战', async ({ page }, testInfo) => {
  await seed(page, [1024, 1024, 0, 0, ...empty], 1000, 100);
  await press(page, 'ArrowLeft');
  await expect(page.locator('#status-2048')).toHaveAttribute('data-state', 'won');
  await expect(page.getByRole('heading', { name: '2048，做到了！' })).toBeVisible();
  await expect(page.getByRole('button', { name: '继续挑战', exact: true })).toBeFocused();
  await expect(page.locator('#score-2048')).toHaveText('3,048');
  await page.screenshot({ path: testInfo.outputPath('2048-won.png'), fullPage: true });
  await page.getByRole('button', { name: '撤销一步，再想想' }).click();
  await expect(page.locator('.result-overlay')).toHaveCount(0);
  await expect(page.locator('#score-2048')).toHaveText('1,000');
  await press(page, 'ArrowLeft');
  await page.getByRole('button', { name: '继续挑战', exact: true }).click();
  await expect(page.locator('#status-2048')).toHaveAttribute('data-state', 'playing');
  await press(page, 'ArrowDown');
  await expect(page.locator('.result-overlay')).toHaveCount(0);
  await page.reload();
  await expect(page.locator('#status-2048')).toHaveAttribute('data-state', 'playing');
  await expect(page.locator('.result-overlay')).toHaveCount(0);
});

test('2048 满盘失败、失败后撤销和重新开始', async ({ page }, testInfo) => {
  await seed(page, [4, 2, 4, 0, ...deadBoard.slice(4)], 120, 10);
  await press(page, 'ArrowRight');
  await expect(page.locator('#status-2048')).toHaveAttribute('data-state', 'over');
  expect(await readBoard(page)).toEqual(deadBoard);
  await expect(page.getByRole('button', { name: '再玩一局', exact: true })).toBeFocused();
  await page.screenshot({ path: testInfo.outputPath('2048-over.png'), fullPage: true });
  await page.getByRole('button', { name: '撤销一步，再想想' }).click();
  await expect(page.locator('#status-2048')).toHaveAttribute('data-state', 'playing');
  await expect(page.locator('#moves-2048')).toHaveText('10');
  await press(page, 'ArrowRight');
  await page.getByRole('button', { name: '再玩一局', exact: true }).click();
  await expect(page.locator('#status-2048')).toHaveAttribute('data-state', 'playing');
  await expect(page.locator('#moves-2048')).toHaveText('0');
  await expect(page.locator('#best-2048')).toHaveText('120');
});

test('2048 支持真实滑动，轻触与取消手势不会移动', async ({ page, isMobile }) => {
  const board = page.locator('.number-board');
  await board.scrollIntoViewIfNeeded();
  const box = (await board.boundingBox())!;
  const x = box.x + box.width * .75;
  const y = box.y + box.height / 2;
  if (isMobile) {
    const client = await page.context().newCDPSession(page);
    await client.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y }] });
    await client.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    await expect(page.locator('#moves-2048')).toHaveText('0');
    await client.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y }] });
    await client.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: x - 50, y }] });
    await client.send('Input.dispatchTouchEvent', { type: 'touchCancel', touchPoints: [] });
    await expect(page.locator('#moves-2048')).toHaveText('0');
    await client.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y }] });
    await client.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: x - 100, y }] });
    await client.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    await client.detach();
  } else {
    await page.mouse.click(x, y);
    await expect(page.locator('#moves-2048')).toHaveText('0');
    await page.mouse.move(x, y);
    await page.mouse.down();
    await page.mouse.move(x - 100, y, { steps: 5 });
    await page.mouse.up();
  }
  await expect(page.locator('#score-2048')).toHaveText('4');
  await expect(board).toHaveAttribute('data-animating', 'false');
  if (isMobile) {
    await page.getByRole('button', { name: '向下移动', exact: true }).tap();
    await expect(page.locator('#moves-2048')).toHaveText('2');
    await expect(board).toHaveAttribute('data-animating', 'false');
    expect((await readBoard(page)).slice(12, 14)).toEqual([4, 2]);
  }
});

test('2048 拒绝损坏存档并保留有效最高纪录', async ({ page }) => {
  await page.evaluate((key) => localStorage.setItem(key, JSON.stringify({ version: 1, board: [3], score: 0, moves: 0, continued: false, best: 512 })), STORAGE_KEY);
  await page.reload();
  await expect(page.locator('#best-2048')).toHaveText('512');
  await expect(page.locator('.number-tile')).toHaveCount(2);
  await press(page, 'ArrowLeft');
  await expect(page.locator('#score-2048')).toHaveText('4');
});

test('2048 无法使用本地存储时仍可游玩并显示提示', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.addInitScript(() => {
    Storage.prototype.getItem = () => { throw new DOMException('Storage blocked', 'SecurityError'); };
    Storage.prototype.setItem = () => { throw new DOMException('Storage blocked', 'SecurityError'); };
  });
  await page.reload();
  await expect(page.locator('.save-note')).toHaveText('浏览器存储不可用，本局仍可正常游玩');
  await press(page, 'ArrowLeft');
  await expect(page.locator('#score-2048')).toHaveText('4');
  expect(errors).toEqual([]);
});

test('2048 各屏幕宽度不溢出，数字、按钮和棋盘完整可见', async ({ page, isMobile }, testInfo) => {
  await seed(page, [2, 4, 8, 16, 32, 64, 128, 256, 512, 1024, 2, 4, 0, 0, 8, 16], 5280, 326);
  for (const width of isMobile ? [320, 393] : [768, 1024, 1440]) {
    await page.setViewportSize({ width, height: 1000 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    const box = (await page.locator('.number-board').boundingBox())!;
    expect(Math.abs(box.width - box.height)).toBeLessThan(2);
    expect(box.width).toBeGreaterThan(250);
    await expect(page.locator('#restart-2048')).toBeVisible();
    await expect(page.locator('.number-board .tile-1024')).toHaveText('1024');
  }
  await page.screenshot({ path: testInfo.outputPath('2048-playing.png'), fullPage: true });
});
