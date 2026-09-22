import { test, expect } from '@playwright/test';
import { chord, createGame, neighbors, reveal, toggleFlag } from '../src/games/minesweeper/engine';

const blueprint = createGame();
reveal(blueprint, 0, () => 0.37);
const mineIndices = blueprint.cells.flatMap((cell, index) => cell.mine ? [index] : []);
const hiddenSafe = blueprint.cells.findIndex((cell) => !cell.mine && !cell.revealed);
const cellSelector = (index: number) => `.mine-cell[data-index="${index}"]`;

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => { Math.random = () => 0.37; });
  await page.goto('/#/games/minesweeper');
  await expect(page.locator('.mine-cell')).toHaveCount(81);
});

test('扫雷首击安全、插旗模式、右键和计时', async ({ page, isMobile }, testInfo) => {
  await expect(page.locator('#mine-status')).toHaveAttribute('data-state', 'ready');
  await expect(page.locator('#mine-remaining')).toHaveText('10颗');
  await page.screenshot({ path: testInfo.outputPath('minesweeper-ready.png'), fullPage: true });
  await page.clock.install();
  await page.getByRole('button', { name: '插旗', exact: true }).click();
  await page.locator(cellSelector(0)).click();
  await expect(page.locator(cellSelector(0))).toHaveClass(/flagged/);
  await expect(page.locator(`${cellSelector(0)} use`)).toHaveAttribute('href', /\.svg(?:\?[^#]*)?#mine-flag$/);
  await expect.poll(() => page.locator(`${cellSelector(0)} use`).evaluate((use) => (use as SVGUseElement).getBBox().width)).toBeGreaterThan(0);
  await expect(page.locator('#mine-remaining')).toHaveText('09颗');
  await page.clock.runFor(3000);
  await expect(page.locator('#mine-timer')).toHaveText('00:00');
  await expect(page.locator('#mine-status')).toHaveAttribute('data-state', 'ready');
  await page.getByRole('button', { name: '翻开', exact: true }).click();
  await page.locator(cellSelector(0)).click();
  await expect(page.locator('#mine-status')).toHaveAttribute('data-state', 'ready');
  if (isMobile) {
    await page.getByRole('button', { name: '插旗', exact: true }).tap();
    await page.locator(cellSelector(0)).tap();
    await page.getByRole('button', { name: '翻开', exact: true }).tap();
    await page.locator(cellSelector(0)).tap();
  } else {
    await page.locator(cellSelector(0)).click({ button: 'right' });
    await page.locator(cellSelector(0)).click();
  }
  await expect(page.locator('#mine-status')).toHaveAttribute('data-state', 'playing');
  await expect(page.locator(cellSelector(0))).toHaveAttribute('data-number', '0');
  for (const index of [0, ...neighbors(blueprint, 0)]) {
    await expect(page.locator(cellSelector(index))).toHaveClass(/revealed/);
  }
  await expect(page.locator('.show-mine')).toHaveCount(0);
  await page.clock.runFor(3200);
  await expect(page.locator('#mine-timer')).toHaveText('00:03');
  await page.screenshot({ path: testInfo.outputPath('minesweeper-playing.png'), fullPage: true });
});

test('扫雷重开确认、难度切换与大棋盘滑动不溢出页面', async ({ page, isMobile }) => {
  await page.locator(cellSelector(0)).click();
  const revealedCount = await page.locator('.mine-cell.revealed').count();
  await page.locator('#mine-restart').click();
  await expect(page.getByRole('dialog')).toBeVisible();
  await page.getByRole('button', { name: '继续本局', exact: true }).click();
  await expect(page.locator('.mine-cell.revealed')).toHaveCount(revealedCount);
  await page.locator('[data-level="hard"]').click();
  await expect(page.getByRole('dialog')).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.locator('.mine-cell')).toHaveCount(81);
  await page.locator('[data-level="hard"]').click();
  await page.getByRole('button', { name: '切换难度', exact: true }).click();
  await expect(page.locator('.mine-cell')).toHaveCount(480);
  await expect(page.locator('#mine-remaining')).toHaveText('99颗');
  await expect(page.locator('#mine-timer')).toHaveText('00:00');
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await page.locator(cellSelector(29)).click();
  await expect(page.locator(cellSelector(29))).toHaveAttribute('data-number', '0');
  expect(await page.locator('.mine-board-scroll').evaluate((element) => element.scrollLeft)).toBeGreaterThan(0);
  await page.locator('[data-level="normal"]').click();
  await page.getByRole('button', { name: '切换难度', exact: true }).click();
  await expect(page.locator('.mine-cell')).toHaveCount(256);
  await expect(page.locator('#mine-remaining')).toHaveText('40颗');
  await expect(page.locator('.mine-board-scroll')).toHaveJSProperty('scrollLeft', 0);
  await page.locator('[data-level="easy"]').click();
  await expect(page.locator('.mine-cell')).toHaveCount(81);
  if (isMobile) {
    await page.setViewportSize({ width: 320, height: 740 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    const bounds = await page.locator(cellSelector(0)).boundingBox();
    expect(bounds!.width).toBeGreaterThanOrEqual(24);
  }
});

test('扫雷踩雷展示、错误旗帜、计时冻结和重新开始', async ({ page }, testInfo) => {
  await page.clock.install();
  await page.locator(cellSelector(0)).click();
  await page.clock.runFor(2400);
  await page.getByRole('button', { name: '插旗', exact: true }).click();
  await page.locator(cellSelector(hiddenSafe)).click();
  await page.locator(cellSelector(mineIndices[1])).click();
  await page.getByRole('button', { name: '翻开', exact: true }).click();
  await page.locator(cellSelector(mineIndices[0])).click();
  await expect(page.locator('#mine-status')).toHaveAttribute('data-state', 'lost');
  await expect(page.locator('.mine-cell.show-mine')).toHaveCount(10);
  await expect(page.locator('.mine-cell.exploded')).toHaveCount(1);
  await expect(page.locator('.mine-cell.exploded use')).toHaveAttribute('href', /\.svg(?:\?[^#]*)?#mine-bomb$/);
  await expect.poll(() => page.locator('.mine-cell.exploded use').evaluate((use) => (use as SVGUseElement).getBBox().width)).toBeGreaterThan(0);
  await expect(page.locator('.mine-cell.wrong-flag')).toHaveCount(1);
  const time = await page.locator('#mine-timer').textContent();
  const board = await page.locator('.mine-board').innerHTML();
  await page.clock.runFor(10000);
  await expect(page.locator('#mine-timer')).toHaveText(time!);
  await page.locator(cellSelector(hiddenSafe)).dispatchEvent('click');
  await page.locator(cellSelector(hiddenSafe)).dispatchEvent('contextmenu');
  expect(await page.locator('.mine-board').innerHTML()).toBe(board);
  await page.screenshot({ path: testInfo.outputPath('minesweeper-lost.png'), fullPage: true });
  await page.getByRole('button', { name: '再玩一局', exact: true }).click();
  await expect(page.locator('#mine-status')).toHaveAttribute('data-state', 'ready');
  await expect(page.locator('.mine-cell.revealed')).toHaveCount(0);
  await expect(page.locator('.mine-cell.flagged')).toHaveCount(0);
  await expect(page.locator('#mine-timer')).toHaveText('00:00');
});

test('扫雷通关、按难度保存及路由离开清理', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.clock.install();
  await page.locator(cellSelector(0)).click();
  for (let index = 0; index < blueprint.cells.length; index++) {
    if (!blueprint.cells[index].mine && !blueprint.cells[index].revealed) {
      const tile = page.locator(cellSelector(index));
      if (!(await tile.getAttribute('class'))?.includes('revealed')) await tile.click();
    }
  }
  await expect(page.locator('#mine-status')).toHaveAttribute('data-state', 'won');
  await expect(page.locator('#mine-progress')).toHaveText('71/ 71');
  await expect(page.locator('#mine-remaining')).toHaveText('00颗');
  const elapsed = await page.locator('#mine-timer').textContent();
  await expect(page.locator('#mine-best')).toHaveText(elapsed!);
  await expect(page.getByRole('status')).toContainText('新的最佳记录');
  await page.clock.runFor(5000);
  await expect(page.locator('#mine-timer')).toHaveText(elapsed!);
  await page.getByRole('link', { name: '返回大厅', exact: true }).click();
  await page.clock.runFor(10000);
  await page.getByRole('link', { name: '开始玩扫雷', exact: true }).click();
  await expect(page.locator('#mine-status')).toHaveAttribute('data-state', 'ready');
  await expect(page.locator('#mine-best')).toHaveText(elapsed!);
  await page.locator('[data-level="normal"]').click();
  await expect(page.locator('#mine-best')).toHaveText('--:--');
  await page.reload();
  await expect(page.locator('#mine-best')).toHaveText(elapsed!);
  expect(errors).toEqual([]);
});

test('扫雷数字快速展开与键盘漫游', async ({ page }) => {
  const fixture = structuredClone(blueprint);
  const numberIndex = fixture.cells.findIndex((cell, index) => cell.revealed && cell.adjacent > 0
    && neighbors(fixture, index).some((next) => !fixture.cells[next].mine && !fixture.cells[next].revealed));
  expect(numberIndex).toBeGreaterThanOrEqual(0);
  const aroundMines = neighbors(fixture, numberIndex).filter((index) => fixture.cells[index].mine);
  await page.locator(cellSelector(0)).focus();
  await page.keyboard.press('ArrowRight');
  await expect(page.locator(cellSelector(1))).toBeFocused();
  await page.keyboard.press('f');
  await expect(page.locator(cellSelector(1))).toHaveClass(/flagged/);
  await page.keyboard.press('f');
  await page.keyboard.press('ArrowLeft');
  await page.keyboard.press('Enter');
  await expect(page.locator('#mine-status')).toHaveAttribute('data-state', 'playing');
  for (const index of aroundMines) {
    toggleFlag(fixture, index);
    await page.locator(cellSelector(index)).focus();
    await page.keyboard.press('f');
  }
  chord(fixture, numberIndex);
  await page.locator(cellSelector(numberIndex)).click();
  await expect(page.locator('.mine-cell.revealed')).toHaveCount(fixture.revealedCount);
  await expect(page.locator('#mine-status')).not.toHaveAttribute('data-state', 'lost');
  await page.locator(cellSelector(8)).focus();
  await page.keyboard.press('ArrowRight');
  await expect(page.locator(cellSelector(8))).toBeFocused();
  await page.keyboard.press('ArrowDown');
  await expect(page.locator(cellSelector(17))).toBeFocused();
});

test('扫雷浏览器存储不可用时仍可通关并暂存记录', async ({ page }) => {
  await page.addInitScript(() => {
    Storage.prototype.getItem = () => { throw new Error('storage blocked'); };
    Storage.prototype.setItem = () => { throw new Error('storage blocked'); };
  });
  await page.reload();
  await expect(page.locator('.mine-record')).toContainText('记录仅保留于本次打开');
  await page.locator(cellSelector(0)).click();
  for (let index = 0; index < blueprint.cells.length; index++) {
    if (!blueprint.cells[index].mine && !blueprint.cells[index].revealed) {
      const tile = page.locator(cellSelector(index));
      if (!(await tile.getAttribute('class'))?.includes('revealed')) await tile.click();
    }
  }
  await expect(page.locator('#mine-status')).toHaveAttribute('data-state', 'won');
  await expect(page.locator('#mine-best')).not.toHaveText('--:--');
});

test('扫雷零秒最佳记录与无效存储数据', async ({ page }) => {
  await page.evaluate(() => localStorage.setItem('little-break-minesweeper-records', '{"easy":0,"normal":-1,"hard":"bad"}'));
  await page.reload();
  await expect(page.locator('#mine-best')).toHaveText('00:00');
  await page.locator('[data-level="normal"]').click();
  await expect(page.locator('#mine-best')).toHaveText('--:--');
  await page.locator('[data-level="hard"]').click();
  await expect(page.locator('#mine-best')).toHaveText('--:--');
  await page.evaluate(() => localStorage.setItem('little-break-minesweeper-records', '{broken'));
  await page.reload();
  await expect(page.locator('#mine-best')).toHaveText('--:--');
  await page.locator(cellSelector(0)).click();
  await expect(page.locator('#mine-status')).toHaveAttribute('data-state', 'playing');
});

for (const delayStorageEvent of [false, true]) {
  test(`扫雷跨标签页合并各难度最短用时${delayStorageEvent ? '（存储事件未到达）' : '并实时同步'}`, async ({ page, context }) => {
    if (delayStorageEvent) {
      await page.addInitScript(() => window.addEventListener('storage', (event) => event.stopImmediatePropagation()));
      await page.reload();
    }
    await page.clock.install({ time: new Date('2026-01-01T00:00:00Z') });
    await page.clock.pauseAt(new Date('2026-01-01T00:00:01Z'));
    await page.locator(cellSelector(0)).click();
    await page.clock.runFor(10000);
    const revealedCount = await page.locator('.mine-cell.revealed').count();
    const other = await context.newPage();
    await other.goto('/#/games/minesweeper');
    await expect(other.locator('#mine-best')).toHaveText('--:--');
    await other.evaluate(() => localStorage.setItem('little-break-minesweeper-records', JSON.stringify({ easy: 20, normal: 60, hard: null })));
    if (!delayStorageEvent) await expect(page.locator('#mine-best')).toHaveText('00:20');
    await expect(page.locator('.mine-cell.revealed')).toHaveCount(revealedCount);
    await expect(page.locator('#mine-timer')).toHaveText('00:10');
    for (let index = 0; index < blueprint.cells.length; index++) {
      if (!blueprint.cells[index].mine && !blueprint.cells[index].revealed) {
        const tile = page.locator(cellSelector(index));
        if (!(await tile.getAttribute('class'))?.includes('revealed')) await tile.click();
      }
    }
    await expect(page.locator('#mine-status')).toHaveAttribute('data-state', 'won');
    await expect(page.locator('#mine-best')).toHaveText('00:10');
    expect(await page.evaluate(() => JSON.parse(localStorage.getItem('little-break-minesweeper-records')!))).toEqual({ easy: 10, normal: 60, hard: null });
    await expect(other.locator('#mine-best')).toHaveText('00:10');
    await other.evaluate(() => localStorage.setItem('little-break-minesweeper-records', JSON.stringify({ easy: 0, normal: 60, hard: null })));
    if (!delayStorageEvent) await expect(page.locator('#mine-best')).toHaveText('00:00');
    await page.locator('#mine-restart').click();
    await page.locator(cellSelector(0)).click();
    await page.clock.runFor(20000);
    for (let index = 0; index < blueprint.cells.length; index++) {
      if (!blueprint.cells[index].mine && !blueprint.cells[index].revealed) {
        const tile = page.locator(cellSelector(index));
        if (!(await tile.getAttribute('class'))?.includes('revealed')) await tile.click();
      }
    }
    await expect(page.locator('#mine-status')).toHaveAttribute('data-state', 'won');
    await expect(page.locator('#mine-best')).toHaveText('00:00');
    await expect(page.getByRole('status')).not.toContainText('新的最佳记录');
    expect(await page.evaluate(() => JSON.parse(localStorage.getItem('little-break-minesweeper-records')!).easy)).toBe(0);
    await other.close();
  });
}
