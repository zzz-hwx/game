import { test, expect } from '@playwright/test';
import type { Locator, Page } from '@playwright/test';

const card = (page: Page, index: number) => page.locator(`.memory-card[data-card="${index}"]`);
const difficultyCases = [
  { name: '标准 8 对', pairs: 8 },
  { name: '轻松 6 对', pairs: 6 },
  { name: '挑战 12 对', pairs: 12 },
];

async function activate(locator: Locator, isMobile: boolean, force = false): Promise<void> {
  // Force is only used to send real input to aria-disabled cards and verify rejection.
  if (isMobile) await locator.tap({ force });
  else await locator.click({ force });
}

async function expectReady(page: Page, pairs = 8): Promise<void> {
  await expect(page.locator('.board-shell')).toHaveAttribute('data-state', 'ready');
  await expect(page.locator('.memory-card')).toHaveCount(pairs * 2);
  await expect(page.locator('.memory-card.flipped')).toHaveCount(0);
  await expect(page.locator('.memory-card.matched')).toHaveCount(0);
  await expect(page.locator('#memory-pairs')).toHaveText('0');
  await expect(page.locator('#memory-moves')).toHaveText('00');
  await expect(page.locator('#memory-time')).toHaveText('00:00');
  await expect(page.getByRole('progressbar', { name: '配对进度' })).toHaveAttribute('aria-valuenow', '0');
  await expect(page.getByRole('progressbar', { name: '配对进度' })).toHaveAttribute('aria-valuemax', String(pairs));
  await expect(page.locator('.collection-fruits > span')).toHaveCount(pairs);
  await expect(page.locator('.collection-fruits .collected')).toHaveCount(0);
  await expect(page.locator('.pause-overlay')).toBeHidden();
  await expect(page.getByRole('region', { name: '通关结果' })).toBeHidden();
  await expect(page.getByRole('dialog')).toBeHidden();
}

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => { Math.random = () => 1 - Number.EPSILON; });
  const epoch = new Date('2026-01-01T00:00:00Z');
  await page.clock.install({ time: epoch });
  // Freeze before mounting so actionability waits cannot advance the game timer.
  await page.clock.pauseAt(new Date(epoch.getTime() + 1000));
  await page.goto('/#/games/memory');
  await expect(page.locator('.memory-board')).toBeVisible();
});

test('翻牌 ready 不计时，首翻开始，同卡重复无效，配对立即保留并收集', async ({ page, isMobile }) => {
  await expectReady(page);
  await expect(page.getByRole('button', { name: '暂停一下', exact: true })).toBeDisabled();
  await page.clock.runFor(5000);
  await expectReady(page);
  await activate(card(page, 0), isMobile);
  await expect(page.locator('.board-shell')).toHaveAttribute('data-state', 'playing');
  await expect(card(page, 0)).toHaveClass(/flipped/);
  await expect(card(page, 0)).toHaveAttribute('aria-label', '第 1 张，樱桃');
  await expect(page.locator('#memory-moves')).toHaveText('00');
  await page.clock.runFor(1200);
  await expect(page.locator('#memory-time')).toHaveText('00:01');
  await activate(card(page, 0), isMobile, true);
  await activate(card(page, 0), isMobile, true);
  await expect(page.locator('.memory-card.flipped')).toHaveCount(1);
  await expect(page.locator('#memory-moves')).toHaveText('00');
  await expect(page.locator('#memory-pairs')).toHaveText('0');
  await activate(card(page, 1), isMobile);
  await expect(page.locator('.memory-card.matched')).toHaveCount(2);
  await expect(card(page, 0)).toHaveClass(/flipped/);
  await expect(card(page, 1)).toHaveClass(/flipped/);
  await expect(page.locator('#memory-moves')).toHaveText('01');
  await expect(page.locator('#memory-pairs')).toHaveText('1');
  await expect(page.locator('#memory-status')).toContainText('樱桃配对成功');
  await expect(page.locator('.collection-fruits [aria-label="樱桃：已找到"]')).toHaveClass(/collected/);
  await expect(page.locator('.collection-fruits .collected')).toHaveCount(1);
  await expect(page.getByRole('progressbar', { name: '配对进度' })).toHaveAttribute('aria-valuenow', '1');
  await activate(card(page, 1), isMobile, true);
  await expect(page.locator('#memory-moves')).toHaveText('01');
  await page.clock.runFor(2000);
  await expect(page.locator('.memory-card.flipped.matched')).toHaveCount(2);
  await expect(page.locator('#memory-time')).toHaveText('00:03');
  await activate(card(page, 2), isMobile);
  await expect(page.locator('.memory-card.flipped')).toHaveCount(3);
});

test('错配在 900ms 回盖，期间拒绝第三张及重复翻牌', async ({ page, isMobile }) => {
  await activate(card(page, 0), isMobile);
  await activate(card(page, 2), isMobile);
  await expect(page.locator('#memory-moves')).toHaveText('01');
  await expect(page.locator('#memory-pairs')).toHaveText('0');
  await expect(page.locator('.memory-card.flipped')).toHaveCount(2);
  await expect(card(page, 1)).toHaveAttribute('aria-disabled', 'true');
  await activate(card(page, 1), isMobile, true);
  await activate(card(page, 0), isMobile, true);
  await page.clock.runFor(899);
  await expect(card(page, 0)).toHaveClass(/flipped/);
  await expect(card(page, 2)).toHaveClass(/flipped/);
  await activate(card(page, 3), isMobile, true);
  await expect(card(page, 3)).not.toHaveClass(/flipped/);
  await expect(page.locator('#memory-moves')).toHaveText('01');
  await page.clock.runFor(1);
  await expect(page.locator('.memory-card.flipped')).toHaveCount(0);
  await expect(page.locator('.memory-card.matched')).toHaveCount(0);
  await expect(card(page, 1)).toHaveAttribute('aria-disabled', 'false');
  await activate(card(page, 0), isMobile);
  await activate(card(page, 1), isMobile);
  await expect(page.locator('#memory-moves')).toHaveText('02');
  await expect(page.locator('#memory-pairs')).toHaveText('1');
});

for (const selections of [1, 2]) {
  test(`暂停隐藏 ${selections} 张已翻卡并冻结计时，恢复保留选择和剩余错配时间`, async ({ page, isMobile }) => {
    await activate(card(page, 4), isMobile);
    await activate(card(page, 5), isMobile);
    await activate(card(page, 0), isMobile);
    await page.clock.runFor(1000);
    if (selections === 2) {
      await activate(card(page, 2), isMobile);
      await page.clock.runFor(300);
    }
    await activate(page.getByRole('button', { name: '暂停一下', exact: true }), isMobile);
    await expect(page.locator('.board-shell')).toHaveAttribute('data-state', 'paused');
    await expect(page.locator('.memory-board')).toBeHidden();
    await expect(page.locator('.memory-board')).toHaveJSProperty('inert', true);
    await expect(card(page, 0)).toHaveAttribute('aria-label', '第 1 张，牌背');
    await expect(card(page, 4)).toHaveAttribute('aria-label', '第 5 张，牌背，已配对');
    const resume = page.locator('.pause-overlay').getByRole('button', { name: '继续游戏', exact: true });
    await expect(resume).toBeFocused();
    await page.keyboard.press('ArrowRight');
    await page.clock.runFor(10_000);
    await expect(page.locator('#memory-time')).toHaveText('00:01');
    await expect(page.locator('#memory-moves')).toHaveText(selections === 2 ? '02' : '01');
    await expect(page.locator('.memory-card.flipped')).toHaveCount(2 + selections);
    await activate(resume, isMobile);
    await expect(page.locator('.board-shell')).toHaveAttribute('data-state', 'playing');
    await expect(page.locator('.memory-board')).toBeVisible();
    await expect(page.locator('.memory-board')).toHaveJSProperty('inert', false);
    await expect(card(page, selections === 2 ? 2 : 0)).toBeFocused();
    await expect(card(page, 0)).toHaveAttribute('aria-label', '第 1 张，樱桃');
    await expect(page.locator('.memory-card.flipped.matched')).toHaveCount(2);
    if (selections === 2) {
      await page.clock.runFor(599);
      await expect(page.locator('.memory-card.flipped')).toHaveCount(4);
      await page.clock.runFor(1);
      await expect(card(page, 0)).not.toHaveClass(/flipped/);
      await expect(card(page, 2)).not.toHaveClass(/flipped/);
      await expect(page.locator('.memory-card.flipped.matched')).toHaveCount(2);
      await page.clock.runFor(1000);
    } else {
      await page.clock.runFor(1000);
      await expect(card(page, 0)).toHaveClass(/flipped/);
      await activate(card(page, 1), isMobile);
      await expect(page.locator('#memory-pairs')).toHaveText('2');
    }
    await expect(page.locator('#memory-time')).toHaveText('00:02');
  });
}

test('重开取消恢复进行中的局，确认清空配对、时间和等待中的错配', async ({ page, isMobile }) => {
  for (const index of [0, 1, 2, 4]) await activate(card(page, index), isMobile);
  await page.clock.runFor(300);
  const restart = page.getByRole('button', { name: '重新开始', exact: true });
  await activate(restart, isMobile);
  await expect(page.getByRole('dialog')).toBeVisible();
  await expect(page.locator('.board-shell')).toHaveAttribute('data-state', 'paused');
  await page.clock.runFor(5000);
  await expect(page.locator('#memory-time')).toHaveText('00:00');
  await expect(page.locator('#memory-moves')).toHaveText('02');
  await activate(page.getByRole('button', { name: '保留本局', exact: true }), isMobile);
  await expect(page.getByRole('dialog')).toBeHidden();
  await expect(page.locator('.board-shell')).toHaveAttribute('data-state', 'playing');
  await expect(page.locator('.memory-card.flipped')).toHaveCount(4);
  await expect(page.locator('#memory-pairs')).toHaveText('1');
  await page.clock.runFor(599);
  await expect(card(page, 2)).toHaveClass(/flipped/);
  await page.clock.runFor(1);
  await expect(page.locator('.memory-card.flipped')).toHaveCount(2);
  await page.clock.runFor(1000);
  await expect(page.locator('#memory-time')).toHaveText('00:01');
  await activate(card(page, 2), isMobile);
  await activate(card(page, 4), isMobile);
  await activate(restart, isMobile);
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog')).toBeHidden();
  await expect(page.locator('.board-shell')).toHaveAttribute('data-state', 'playing');
  await expect(page.locator('.memory-card.flipped')).toHaveCount(4);
  await activate(restart, isMobile);
  await activate(page.getByRole('button', { name: '确定重开', exact: true }), isMobile);
  await expectReady(page);
  await expect(card(page, 0)).toBeFocused();
  await page.clock.runFor(2000);
  await expectReady(page);
  await activate(card(page, 2), isMobile);
  await page.clock.runFor(1000);
  await expect(card(page, 2)).toHaveClass(/flipped/);
  await activate(card(page, 3), isMobile);
  await expect(page.locator('#memory-moves')).toHaveText('01');
  await expect(page.locator('#memory-pairs')).toHaveText('1');
});

test('已暂停时取消重开或按 Escape 仍保持暂停', async ({ page, isMobile }) => {
  await activate(card(page, 0), isMobile);
  await page.clock.runFor(1200);
  await activate(page.getByRole('button', { name: '暂停一下', exact: true }), isMobile);
  for (const cancelWithEscape of [false, true]) {
    await activate(page.getByRole('button', { name: '重新开始', exact: true }), isMobile);
    await expect(page.getByRole('dialog')).toBeVisible();
    if (cancelWithEscape) await page.keyboard.press('Escape');
    else await activate(page.getByRole('button', { name: '保留本局', exact: true }), isMobile);
    await expect(page.getByRole('dialog')).toBeHidden();
    await expect(page.locator('.board-shell')).toHaveAttribute('data-state', 'paused');
    await expect(page.locator('.memory-board')).toBeHidden();
    await page.clock.runFor(5000);
    await expect(page.locator('#memory-time')).toHaveText('00:01');
    await expect(page.locator('.memory-card.flipped')).toHaveCount(1);
  }
  await activate(page.locator('.pause-overlay').getByRole('button', { name: '继续游戏', exact: true }), isMobile);
  await expect(card(page, 0)).toHaveClass(/flipped/);
  await activate(card(page, 1), isMobile);
  await expect(page.locator('#memory-pairs')).toHaveText('1');
  await page.clock.runFor(1000);
  await expect(page.locator('#memory-time')).toHaveText('00:02');
});

test('切换所有难度可取消，确认后清空旧局且牌数、收集数和进度上限正确', async ({ page, isMobile }) => {
  for (const mode of [difficultyCases[1], difficultyCases[2], difficultyCases[0]]) {
    for (const index of [0, 1]) await activate(card(page, index), isMobile);
    await page.clock.runFor(1200);
    for (const index of [2, 4]) await activate(card(page, index), isMobile);
    const oldCount = await page.locator('.memory-card').count();
    await activate(page.locator('.difficulty-options button[aria-pressed="true"]'), isMobile);
    await expect(page.getByRole('dialog')).toBeHidden();
    await expect(page.locator('#memory-moves')).toHaveText('02');
    const target = page.getByRole('button', { name: mode.name, exact: true });
    await activate(target, isMobile);
    await expect(page.getByRole('dialog')).toContainText('换个难度');
    await page.keyboard.press('Escape');
    await expect(page.locator('.memory-card')).toHaveCount(oldCount);
    await expect(target).toHaveAttribute('aria-pressed', 'false');
    await expect(page.locator('.board-shell')).toHaveAttribute('data-state', 'playing');
    await expect(page.locator('#memory-pairs')).toHaveText('1');
    await expect(page.locator('.memory-card.flipped')).toHaveCount(4);
    await activate(target, isMobile);
    await activate(page.getByRole('button', { name: '确定切换', exact: true }), isMobile);
    await expectReady(page, mode.pairs);
    await expect(target).toHaveAttribute('aria-pressed', 'true');
    await expect(page.locator('.board-heading')).toContainText(`${mode.pairs * 2} 张卡片`);
    await page.clock.runFor(1000);
    await expectReady(page, mode.pairs);
  }
  await activate(page.getByRole('button', { name: '轻松 6 对', exact: true }), isMobile);
  await expectReady(page, 6); // An untouched ready board needs no confirmation.
});

test('键盘方向和行列边界不越界，Enter 与 Space 翻牌且重复和锁定时无效', async ({ page, isMobile }) => {
  for (const mode of difficultyCases) {
    await activate(page.getByRole('button', { name: mode.name, exact: true }), isMobile);
    await card(page, 0).focus();
    for (const key of ['ArrowLeft', 'ArrowUp']) {
      await page.keyboard.press(key);
      await expect(card(page, 0)).toBeFocused();
    }
    await page.keyboard.press('ArrowRight');
    await expect(card(page, 1)).toBeFocused();
    await page.keyboard.press('ArrowLeft');
    await expect(card(page, 0)).toBeFocused();
    await page.keyboard.press('End');
    await expect(card(page, 3)).toBeFocused();
    await page.keyboard.press('ArrowRight');
    await expect(card(page, 3)).toBeFocused();
    await page.keyboard.press('ArrowDown');
    await expect(card(page, 7)).toBeFocused();
    await page.keyboard.press('Home');
    await expect(card(page, 4)).toBeFocused();
    await page.keyboard.press('ArrowLeft');
    await expect(card(page, 4)).toBeFocused();
    await page.keyboard.press('ArrowUp');
    await expect(card(page, 0)).toBeFocused();
    await page.keyboard.press('End');
    for (let row = 1; row < mode.pairs / 2; row++) await page.keyboard.press('ArrowDown');
    await expect(card(page, mode.pairs * 2 - 1)).toBeFocused();
    for (const key of ['ArrowRight', 'ArrowDown']) {
      await page.keyboard.press(key);
      await expect(card(page, mode.pairs * 2 - 1)).toBeFocused();
    }
    await page.keyboard.press('Home');
    await expect(card(page, mode.pairs * 2 - 4)).toBeFocused();
    await page.keyboard.press('ArrowDown');
    await expect(card(page, mode.pairs * 2 - 4)).toBeFocused();
    await expect(page.locator('.memory-card[tabindex="0"]')).toHaveCount(1);
    await expectReady(page, mode.pairs);
  }
  await card(page, 0).focus();
  await page.keyboard.press('Enter');
  await expect(page.locator('.board-shell')).toHaveAttribute('data-state', 'playing');
  await expect(card(page, 0)).toHaveClass(/flipped/);
  await page.keyboard.press('Enter');
  await page.keyboard.press('Space');
  await expect(page.locator('#memory-moves')).toHaveText('00');
  await page.keyboard.press('ArrowRight');
  await page.keyboard.press('Space');
  await expect(page.locator('#memory-pairs')).toHaveText('1');
  await expect(page.locator('#memory-moves')).toHaveText('01');
  await page.keyboard.press('ArrowRight');
  await page.keyboard.press('Enter');
  await page.keyboard.press('ArrowDown');
  await page.keyboard.press('Space');
  await expect(page.locator('#memory-moves')).toHaveText('02');
  await page.keyboard.press('ArrowRight');
  await page.keyboard.press('Enter');
  await expect(card(page, 7)).not.toHaveClass(/flipped/);
  await expect(page.locator('#memory-moves')).toHaveText('02');
  await page.clock.runFor(900);
  await page.keyboard.press('Enter');
  await expect(card(page, 7)).toHaveClass(/flipped/);
});

for (const mode of difficultyCases) {
  test(`${mode.name} 全部真实翻牌通关，冻结计时并可再来一局`, async ({ page, isMobile }) => {
    await activate(page.getByRole('button', { name: mode.name, exact: true }), isMobile);
    await activate(card(page, 0), isMobile);
    await page.clock.runFor(2250);
    await activate(card(page, 1), isMobile);
    for (let pair = 1; pair < mode.pairs; pair++) {
      await activate(card(page, pair * 2), isMobile);
      await activate(card(page, pair * 2 + 1), isMobile);
      await expect(page.locator('#memory-pairs')).toHaveText(String(pair + 1));
    }
    await expect(page.locator('.board-shell')).toHaveAttribute('data-state', 'won');
    await expect(page.getByRole('region', { name: '通关结果' })).toContainText('一次不差，记忆力满分');
    await expect(page.locator('.memory-card.flipped.matched')).toHaveCount(mode.pairs * 2);
    await expect(page.locator('.memory-card[aria-disabled="true"]')).toHaveCount(mode.pairs * 2);
    await expect(page.locator('#memory-moves')).toHaveText(String(mode.pairs).padStart(2, '0'));
    await expect(page.locator('#memory-time')).toHaveText('00:02');
    await expect(page.locator('.collection-fruits .collected')).toHaveCount(mode.pairs);
    await expect(page.getByRole('progressbar', { name: '配对进度' })).toHaveAttribute('aria-valuenow', String(mode.pairs));
    await expect(page.getByRole('button', { name: '暂停一下', exact: true })).toBeDisabled();
    await activate(card(page, 0), isMobile, true);
    await page.keyboard.press('Space');
    await page.clock.runFor(10_000);
    await expect(page.locator('#memory-time')).toHaveText('00:02');
    await expect(page.locator('#memory-moves')).toHaveText(String(mode.pairs).padStart(2, '0'));
    await expect(page.locator('.board-shell')).toHaveAttribute('data-state', 'won');
    await activate(page.getByRole('button', { name: '再来一局', exact: true }), isMobile);
    await expectReady(page, mode.pairs);
    await expect(card(page, 0)).toBeFocused();
    await activate(card(page, 0), isMobile);
    await expect(page.locator('.board-shell')).toHaveAttribute('data-state', 'playing');
    // Replay starts between 100ms interval ticks; allow the next UI refresh.
    await page.clock.runFor(1100);
    await expect(page.locator('#memory-time')).toHaveText('00:01');
  });
}

test('离开错配或暂停局时清理计时器和可见性监听，返回为独立新局', async ({ page, isMobile }) => {
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  await activate(page.getByRole('link', { name: '返回大厅', exact: true }), isMobile);
  await expect(page.locator('.lobby')).toBeVisible();
  // Observe browser resources only; do not access or mutate Vue/game internals.
  await page.evaluate(() => {
    const intervals = new Set<number>();
    const listeners = new Set<EventListenerOrEventListenerObject>();
    let ticks = 0;
    const set = window.setInterval.bind(window);
    const clear = window.clearInterval.bind(window);
    window.setInterval = ((handler: TimerHandler, timeout?: number, ...args: unknown[]) => {
      const observed = typeof handler === 'function'
        ? (...values: unknown[]) => { ticks++; return handler(...values); }
        : handler;
      const id = set(observed, timeout, ...args);
      intervals.add(id);
      return id;
    }) as typeof window.setInterval;
    window.clearInterval = ((id?: number) => {
      if (id !== undefined) intervals.delete(id);
      clear(id);
    }) as typeof window.clearInterval;
    const add = document.addEventListener.bind(document);
    const remove = document.removeEventListener.bind(document);
    document.addEventListener = (type: string, listener: EventListenerOrEventListenerObject, options?: boolean | AddEventListenerOptions) => {
      if (type === 'visibilitychange') listeners.add(listener);
      add(type, listener, options);
    };
    document.removeEventListener = (type: string, listener: EventListenerOrEventListenerObject, options?: boolean | EventListenerOptions) => {
      if (type === 'visibilitychange') listeners.delete(listener);
      remove(type, listener, options);
    };
    Object.defineProperty(window, '__memoryLifecycle', {
      value: () => ({ intervals: intervals.size, listeners: listeners.size, ticks }),
    });
  });
  const resources = () => page.evaluate(() => Reflect.get(window, '__memoryLifecycle')() as {
    intervals: number; listeners: number; ticks: number;
  });
  for (const paused of [false, true]) {
    await activate(page.getByRole('link', { name: '开始玩翻牌配对', exact: true }), isMobile);
    await expectReady(page);
    expect(await resources()).toMatchObject({ intervals: 1, listeners: 1 });
    await activate(card(page, 0), isMobile);
    await page.clock.runFor(1000);
    await expect(page.locator('#memory-time')).toHaveText('00:01');
    await activate(card(page, 2), isMobile);
    if (paused) await activate(page.getByRole('button', { name: '暂停一下', exact: true }), isMobile);
    await activate(page.getByRole('link', { name: '返回大厅', exact: true }), isMobile);
    await expect(page.locator('.lobby')).toBeVisible();
    await expect(page.locator('.memory-game')).toHaveCount(0);
    const removed = await resources();
    expect(removed).toMatchObject({ intervals: 0, listeners: 0 });
    expect(removed.ticks).toBeGreaterThan(0);
    await page.clock.runFor(5000);
    await page.keyboard.press('ArrowRight');
    expect(await resources()).toEqual(removed);
    await expect(page.locator('.lobby')).toBeVisible();
  }
  await activate(page.getByRole('link', { name: '开始玩翻牌配对', exact: true }), isMobile);
  await expectReady(page);
  expect(await resources()).toMatchObject({ intervals: 1, listeners: 1 });
  expect(errors).toEqual([]);
});

test('320px 困难布局无横向溢出，末行卡片和暂停、重开仍可操作', async ({ page, isMobile }) => {
  await page.setViewportSize({ width: 320, height: 740 });
  await activate(page.getByRole('button', { name: '挑战 12 对', exact: true }), isMobile);
  await expectReady(page, 12);
  const assertFits = async () => {
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    expect(await page.locator('.memory-board').evaluate(element => element.scrollWidth <= element.clientWidth)).toBe(true);
    for (const selector of ['.board-shell', '.difficulty-card', '.game-actions']) {
      const box = (await page.locator(selector).boundingBox())!;
      expect(box.x).toBeGreaterThanOrEqual(0);
      expect(box.x + box.width).toBeLessThanOrEqual(320);
    }
  };
  await assertFits();
  const boxes = await page.locator('.memory-card').evaluateAll(elements => elements.map(element => {
    const { x, y, width, right } = element.getBoundingClientRect();
    return { x, y, width, right };
  }));
  expect(new Set(boxes.map(box => box.y)).size).toBe(6);
  for (const box of boxes) {
    expect(box.x).toBeGreaterThanOrEqual(0);
    expect(box.right).toBeLessThanOrEqual(320);
    expect(box.width).toBeGreaterThanOrEqual(24);
  }
  await activate(card(page, 23), isMobile);
  await activate(card(page, 22), isMobile);
  await expect(page.locator('#memory-pairs')).toHaveText('1');
  await activate(page.getByRole('button', { name: '暂停一下', exact: true }), isMobile);
  await expect(page.locator('.pause-overlay')).toBeVisible();
  await assertFits();
  await activate(page.getByRole('button', { name: '重新开始', exact: true }), isMobile);
  await expect(page.getByRole('dialog')).toBeVisible();
  const dialog = (await page.getByRole('dialog').boundingBox())!;
  expect(dialog.x).toBeGreaterThanOrEqual(0);
  expect(dialog.x + dialog.width).toBeLessThanOrEqual(320);
  await activate(page.getByRole('button', { name: '确定重开', exact: true }), isMobile);
  await expectReady(page, 12);
  await assertFits();
});
