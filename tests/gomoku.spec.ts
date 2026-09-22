import { test, expect } from '@playwright/test';
import type { Page } from '@playwright/test';

const cell = (page: Page, row: number, col: number) => page.locator(`.gomoku-board [data-cell="${row * 15 + col}"]`);

async function localMode(page: Page): Promise<void> {
  await page.getByRole('button', { name: '双人对弈', exact: true }).click();
}

test.beforeEach(async ({ page }) => {
  await page.goto('/#/games/gomoku');
  await expect(page.getByRole('grid', { name: '五子棋棋盘' })).toBeVisible();
});

test('人机对弈落子、电脑应手、手数和整回合悔棋', async ({ page, isMobile }) => {
  await page.clock.install();
  await expect(page.getByRole('gridcell')).toHaveCount(225);
  await expect(page.locator('#gomoku-undo')).toBeDisabled();
  if (isMobile) await cell(page, 7, 7).tap();
  else await cell(page, 7, 7).click();
  await expect(cell(page, 7, 7)).toHaveAttribute('data-player', '1');
  await expect(page.locator('#gomoku-status')).toHaveText('电脑正在思考…');
  await cell(page, 7, 8).focus();
  await page.keyboard.press('Enter');
  await expect(page.locator('#gomoku-moves')).toHaveText('01');
  await page.clock.runFor(500);
  await expect(page.locator('.cell[data-player="2"]')).toHaveCount(1);
  await expect(page.locator('#gomoku-moves')).toHaveText('02');
  await expect(page.locator('#gomoku-status')).toHaveText('轮到你了，执黑落子');
  await expect(page.locator('.cell.last')).toHaveCount(1);
  await expect(page.locator('.move-list li')).toHaveCount(2);
  await page.getByLabel('显示手数', { exact: true }).check();
  await expect(cell(page, 7, 7).locator('.stone')).toHaveText('1');
  await expect(page.locator('.cell.last .stone')).toHaveText('2');
  await cell(page, 7, 7).focus();
  await page.keyboard.press('Space');
  await expect(page.locator('#gomoku-moves')).toHaveText('02');
  await page.locator('#gomoku-undo').click();
  await expect(page.locator('#gomoku-moves')).toHaveText('00');
  await expect(page.locator('.cell .stone')).toHaveCount(0);
  await expect(cell(page, 7, 7)).toBeFocused();
  await page.clock.runFor(1000);
  await expect(page.locator('#gomoku-moves')).toHaveText('00');
});

test('电脑思考时悔棋和确认重开不会残留落子任务', async ({ page }) => {
  await page.clock.install();
  await cell(page, 7, 7).click();
  await page.locator('#gomoku-undo').click();
  await page.clock.runFor(1000);
  await expect(page.locator('#gomoku-moves')).toHaveText('00');
  await cell(page, 7, 7).click();
  await page.locator('#gomoku-restart').click();
  await expect(page.getByRole('dialog')).toBeVisible();
  await page.clock.runFor(1000);
  await expect(page.locator('#gomoku-moves')).toHaveText('01');
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog')).not.toBeVisible();
  await page.clock.runFor(500);
  await expect(page.locator('#gomoku-moves')).toHaveText('02');
  await page.locator('#gomoku-restart').click();
  await page.getByRole('button', { name: '确定重开', exact: true }).click();
  await page.clock.runFor(1000);
  await expect(page.locator('#gomoku-moves')).toHaveText('00');
  await expect(page.locator('#gomoku-undo')).toBeDisabled();
  await expect(page.locator('.cell .stone')).toHaveCount(0);
});

test('切换模式可取消且保留棋局，确认后双人轮流落子', async ({ page }) => {
  await page.clock.install();
  await cell(page, 7, 7).click();
  await localMode(page);
  await page.getByRole('button', { name: '继续本局', exact: true }).click();
  await page.clock.runFor(500);
  await expect(page.getByRole('button', { name: '人机对弈', exact: true })).toHaveAttribute('aria-pressed', 'true');
  await expect(page.locator('#gomoku-moves')).toHaveText('02');
  await localMode(page);
  await page.getByRole('button', { name: '确定切换', exact: true }).click();
  await expect(page.locator('#gomoku-moves')).toHaveText('00');
  await expect(page.getByRole('button', { name: '双人对弈', exact: true })).toHaveAttribute('aria-pressed', 'true');
  await cell(page, 0, 0).click();
  await page.clock.runFor(1000);
  await expect(page.locator('#gomoku-moves')).toHaveText('01');
  await expect(page.locator('#gomoku-status')).toHaveText('轮到白棋落子');
  await cell(page, 14, 14).click();
  await expect(cell(page, 14, 14)).toHaveAttribute('data-player', '2');
  await expect(page.locator('#gomoku-status')).toHaveText('轮到黑棋落子');
  await page.locator('#gomoku-undo').click();
  await expect(page.locator('#gomoku-moves')).toHaveText('01');
  await expect(page.locator('#gomoku-status')).toHaveText('轮到白棋落子');
});

test('双人连五获胜、终局禁止落子、悔棋恢复并再来一局', async ({ page }) => {
  await localMode(page);
  for (let step = 0; step < 4; step++) {
    await cell(page, 7, 3 + step).click();
    await cell(page, 0, step * 2).click();
  }
  await cell(page, 7, 7).click();
  await expect(page.locator('.gomoku-board')).toHaveAttribute('data-state', 'won');
  await expect(page.locator('#gomoku-status')).toHaveText('黑棋获胜，五子连珠！');
  await expect(page.locator('.cell.winning')).toHaveCount(5);
  await expect(page.locator('.move-list li')).toHaveCount(6);
  await cell(page, 14, 14).focus();
  await page.keyboard.press('Enter');
  await expect(page.locator('#gomoku-moves')).toHaveText('09');
  await page.locator('#gomoku-undo').click();
  await expect(page.locator('.gomoku-board')).toHaveAttribute('data-state', 'playing');
  await expect(page.locator('.cell.winning')).toHaveCount(0);
  await expect(page.locator('#gomoku-status')).toHaveText('轮到黑棋落子');
  await cell(page, 7, 7).click();
  await page.locator('#gomoku-restart').click();
  await expect(page.getByRole('dialog')).not.toBeVisible();
  await expect(page.locator('#gomoku-moves')).toHaveText('00');
  await expect(page.locator('.cell .stone')).toHaveCount(0);
  await expect(page.getByRole('button', { name: '双人对弈', exact: true })).toHaveAttribute('aria-pressed', 'true');
});

test('键盘选择交叉点、边界不越行、快捷键与焦点恢复', async ({ page }) => {
  await localMode(page);
  await expect(cell(page, 7, 7)).toBeFocused();
  await page.keyboard.press('ArrowRight');
  await page.keyboard.press('ArrowUp');
  await expect(cell(page, 6, 8)).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(cell(page, 6, 8)).toHaveAttribute('data-player', '1');
  await page.keyboard.press('ArrowLeft');
  await page.keyboard.press('Space');
  await expect(cell(page, 6, 7)).toHaveAttribute('data-player', '2');
  await page.keyboard.press('z');
  await expect(cell(page, 6, 7)).toBeFocused();
  await expect(page.locator('#gomoku-moves')).toHaveText('01');
  await cell(page, 0, 0).focus();
  await page.keyboard.press('ArrowLeft');
  await page.keyboard.press('ArrowUp');
  await expect(cell(page, 0, 0)).toBeFocused();
  await cell(page, 14, 14).focus();
  await page.keyboard.press('ArrowRight');
  await page.keyboard.press('ArrowDown');
  await expect(cell(page, 14, 14)).toBeFocused();
  await page.keyboard.press('r');
  await expect(page.getByRole('dialog')).toBeVisible();
  await page.getByRole('button', { name: '继续本局', exact: true }).click();
  await expect(cell(page, 14, 14)).toBeFocused();
  await expect(page.locator('#gomoku-moves')).toHaveText('01');
});

test('离开页面清理电脑任务，再进入可正常开局', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.clock.install();
  await cell(page, 7, 7).click();
  await page.getByRole('link', { name: '返回大厅' }).click();
  await page.clock.runFor(1000);
  await expect(page.locator('.game-card-link')).toHaveCount(10);
  await page.getByRole('link', { name: '开始玩五子棋', exact: true }).click();
  await expect(page.locator('#gomoku-moves')).toHaveText('00');
  await cell(page, 7, 7).click();
  await page.clock.runFor(500);
  await expect(page.locator('#gomoku-moves')).toHaveText('02');
  expect(errors).toEqual([]);
});

test('棋盘、导航与按钮在手机和平板桌面宽度下不溢出', async ({ page, isMobile }, testInfo) => {
  for (const width of isMobile ? [320, 393] : [768, 1024, 1440]) {
    await page.setViewportSize({ width, height: 1000 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    const bounds = (await page.locator('.gomoku-board').boundingBox())!;
    expect(bounds.x).toBeGreaterThanOrEqual(0);
    expect(bounds.x + bounds.width).toBeLessThanOrEqual(width);
    expect(Math.abs(bounds.width - bounds.height)).toBeLessThan(2);
    await expect(page.locator('#gomoku-restart')).toBeVisible();
    await page.screenshot({ path: testInfo.outputPath(`gomoku-${width}.png`), fullPage: true });
  }
});
