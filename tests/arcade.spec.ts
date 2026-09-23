import { test, expect } from '@playwright/test';
import type { Page } from '@playwright/test';

const entries = [
  { id: 'snake', name: '贪吃蛇', selector: '.snake-game' },
  { id: 'tetris', name: '俄罗斯方块', selector: '.tetris-game' },
  { id: 'link', name: '连连看', selector: '.link-game' },
  { id: 'minesweeper', name: '扫雷', selector: '.minesweeper-game' },
  { id: '2048', name: '2048', selector: '.game-2048' },
  { id: 'sokoban', name: '推箱子', selector: '.sokoban-game' },
  { id: 'pacman', name: '吃豆人', selector: '.pacman-game' },
  { id: 'gomoku', name: '五子棋', selector: '.gomoku-game' },
  { id: 'breakout', name: '打砖块', selector: '.breakout-game' },
  { id: 'memory', name: '翻牌配对', selector: '.memory-game' },
  { id: 'flappy-bird', name: 'Flappy Bird', selector: '.flappy-bird-game' },
];

async function expectNoOverflow(page: Page) {
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
}

async function expectSvgAssets(page: Page) {
  const references = await page.locator('svg use').evaluateAll((uses) => uses.map((use) => use.getAttribute('href')!));
  expect(references.length).toBeGreaterThan(0);
  for (const reference of references) expect(reference).toMatch(/\.svg(?:\?[^#]*)?#[\w-]+$/);
  const problems = await page.evaluate(async (references) => {
    const errors: string[] = [];
    const urls = [...new Set(references.map((reference) => reference.split('#')[0]!))];
    for (const url of urls) {
      const response = await fetch(url);
      if (!response.ok || !response.headers.get('content-type')?.includes('image/svg+xml')) {
        errors.push(`Invalid SVG response: ${url}`);
        continue;
      }
      const document = new DOMParser().parseFromString(await response.text(), 'image/svg+xml');
      if (document.querySelector('parsererror')) errors.push(`Invalid SVG XML: ${url}`);
      for (const reference of references.filter((value) => value.split('#')[0] === url)) {
        if (!document.getElementById(reference.split('#')[1]!)) errors.push(`Missing SVG symbol: ${reference}`);
      }
    }
    return errors;
  }, references);
  expect(problems).toEqual([]);
  await expect.poll(() => page.locator('svg use').evaluateAll((uses) => uses.flatMap((use) => {
    const svg = use.closest('svg')!;
    const rect = svg.getBoundingClientRect();
    if (!rect.width || !rect.height || getComputedStyle(svg).visibility === 'hidden') return [];
    const bounds = (use as SVGUseElement).getBBox();
    return bounds.width > 0 && bounds.height > 0 ? [] : [use.getAttribute('href')];
  }))).toEqual([]);
  const favicon = await page.locator('link[rel="icon"]').getAttribute('href');
  expect(favicon).toMatch(/\.svg$/);
  const response = await page.request.get(new URL(favicon!, page.url()).href);
  expect(response.ok()).toBe(true);
  expect(response.headers()['content-type']).toContain('image/svg+xml');
}

test('大厅和所有已注册游戏的外部 SVG 均能加载并渲染', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  const pages = [
    { url: '/', selector: '.game-artwork' },
    ...entries.map((game) => ({ url: `/#/games/${game.id}`, selector: game.selector })),
  ];
  for (const { url, selector } of pages) {
    await page.goto(url);
    await expect(page.locator(selector).first()).toBeVisible();
    await expectSvgAssets(page);
  }
  expect(errors).toEqual([]);
});

test('游戏切换音效及暂停时保持外部 SVG 引用', async ({ page }) => {
  for (const [url, snake] of [['/#/games/snake', true], ['/#/games/link', false]] as const) {
    await page.goto(url);
    await expect(page.locator(snake ? '.snake-game' : '.link-game')).toBeVisible();
    await expect(page.locator('#start-button')).toBeVisible();
    const sound = page.locator('#sound-button use');
    const originalSound = await sound.getAttribute('href');
    await page.locator('#sound-button').click();
    await expect(sound).not.toHaveAttribute('href', originalSound!);
    await expectSvgAssets(page);
    await page.locator('#sound-button').click();
    await expect(sound).toHaveAttribute('href', originalSound!);
    await page.locator('#start-button').click();
    const control = page.locator(snake ? '#pause-button' : '#start-button');
    await expect(control.locator('use')).toHaveAttribute('href', snake ? /#icon-pause$/ : /#i-pause$/);
    await control.click();
    await expect(control.locator('use')).toHaveAttribute('href', snake ? /#icon-play$/ : /#i-play$/);
    await expectSvgAssets(page);
  }
});

test('大厅展示全部入口，未知地址返回大厅', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto('/');
  await expect(page.locator('.game-card-link')).toHaveCount(entries.length);
  await expectNoOverflow(page);
  await page.goto('/#/not-a-game');
  await expect(page.locator('.lobby')).toBeVisible();
  expect(errors).toEqual([]);
});

for (const game of entries) {
  test(`大厅${game.name}可进入、返回及刷新`, async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', (error) => errors.push(error.message));
    await page.goto('/');
    await page.getByRole('link', { name: `开始玩${game.name}`, exact: true }).click();
    await expect(page.locator(game.selector)).toBeVisible();
    await expect(page).toHaveTitle(`${game.name} · 摸鱼俱乐部`);
    await expectNoOverflow(page);
    await page.locator('.skip-link').focus();
    await page.keyboard.press('Enter');
    await expect(page.locator('#page-content')).toBeFocused();
    await expect(page).toHaveURL(new RegExp(`#/games/${game.id}$`));
    await page.reload();
    await expect(page.locator(game.selector)).toBeVisible();
    await page.getByRole('link', { name: '返回大厅' }).click();
    await expect(page.locator('.game-card-link')).toHaveCount(entries.length);
    await expect(page.locator(game.selector)).toHaveCount(0);
    expect(errors).toEqual([]);
  });
}

test('手机触屏方向和方块按钮可操作', async ({ page, isMobile }) => {
  test.skip(!isMobile, '触屏按钮仅在移动布局显示');
  await page.goto('/#/games/snake');
  await expect(page.locator('#start-button')).toBeVisible();
  await page.clock.install();
  await page.getByRole('button', { name: '向上', exact: true }).tap();
  await page.clock.runFor(1700);
  await expect(page.locator('#game-status')).toHaveAttribute('data-state', 'over');
  await expect(page.locator('#score')).toHaveText('00');
  await page.getByRole('link', { name: '返回大厅' }).click();
  await page.getByRole('link', { name: '开始玩俄罗斯方块', exact: true }).click();
  await page.locator('#start-button').tap();
  await page.getByRole('button', { name: '向左移动', exact: true }).tap();
  await page.getByRole('button', { name: '旋转方块', exact: true }).tap();
  await page.getByRole('button', { name: '加速下落', exact: true }).tap();
  await expect.poll(async () => Number(await page.locator('#score').textContent())).toBeGreaterThan(0);
  await page.getByRole('button', { name: '直接落底', exact: true }).tap();
});

test('贪吃蛇吃果实、暂停、碰墙结束和重新开始', async ({ page }) => {
  await page.addInitScript(() => { Math.random = () => 0; });
  await page.goto('/#/games/snake');
  await expect(page.locator('#start-button')).toBeVisible();
  await page.clock.install();
  await page.locator('[data-level="normal"]').click();
  await page.locator('#start-button').click();
  await page.clock.runFor(1430);
  await expect(page.locator('#score')).toHaveText('10');
  await page.locator('#pause-button').click();
  await expect(page.locator('#game-status')).toHaveAttribute('data-state', 'paused');
  await page.clock.runFor(5000);
  await expect(page.locator('#score')).toHaveText('10');
  await page.locator('#start-button').click();
  await page.clock.runFor(2000);
  await expect(page.locator('#game-status')).toHaveAttribute('data-state', 'over');
  await page.locator('#start-button').click();
  await expect(page.locator('#score')).toHaveText('00');
  await page.getByRole('link', { name: '返回大厅' }).click();
  await page.clock.runFor(5000);
  await expect(page.locator('.lobby')).toBeVisible();
  await page.getByRole('link', { name: '开始玩贪吃蛇', exact: true }).click();
  await expect(page.locator('#game-status')).toHaveAttribute('data-state', 'ready');
  await expect(page.locator('#best-score')).toHaveText('10');
});

test('俄罗斯方块移动、暂存、硬降、暂停和重开', async ({ page }) => {
  await page.goto('/#/games/tetris');
  await expect(page.locator('#start-button')).toBeVisible();
  await page.clock.install();
  await page.locator('#start-button').click();
  await page.keyboard.press('ArrowLeft');
  await page.keyboard.press('ArrowUp');
  await page.keyboard.press('c');
  await page.keyboard.press('Space');
  await expect.poll(async () => Number(await page.locator('#score').textContent())).toBeGreaterThan(0);
  await page.locator('#pause-button').click();
  await expect(page.locator('#game-overlay')).toBeVisible();
  const pausedBoard = await page.locator('#board').evaluate((canvas) => (canvas as HTMLCanvasElement).toDataURL());
  await page.clock.runFor(5000);
  await page.keyboard.press('ArrowDown');
  expect(await page.locator('#board').evaluate((canvas) => (canvas as HTMLCanvasElement).toDataURL())).toBe(pausedBoard);
  await page.locator('#start-button').click();
  await expect(page.locator('#game-overlay')).toBeHidden();
  await page.locator('#restart-button').click();
  await expect(page.locator('#restart-dialog')).toBeVisible();
  await page.locator('#restart-confirm').click();
  await expect(page.locator('#score')).toHaveText('000000');
  await page.getByRole('link', { name: '返回大厅' }).click();
  await page.clock.runFor(5000);
  await page.getByRole('link', { name: '开始玩俄罗斯方块', exact: true }).click();
  await expect(page.locator('#game-overlay')).toBeVisible();
});

test('俄罗斯方块帮助和重开取消保留进度，堆满后可重玩', async ({ page }) => {
  await page.goto('/#/games/tetris');
  await page.locator('#start-button').click();
  await page.keyboard.press('Space');
  const score = await page.locator('#score').textContent();
  await page.locator('#help-button').click();
  await expect(page.locator('#help-dialog')).toBeVisible();
  await expect(page.locator('#status-label')).toHaveText('休息一下');
  await page.locator('#help-done').click();
  await expect(page.locator('#status-label')).toHaveText('游戏进行中');
  await page.locator('#restart-button').click();
  await page.locator('#restart-cancel').click();
  await expect(page.locator('#score')).toHaveText(score!);
  await expect(page.locator('#status-label')).toHaveText('游戏进行中');
  for (let i = 0; i < 25; i++) await page.keyboard.press('Space');
  await expect(page.locator('#status-label')).toHaveText('本局结束');
  await expect(page.locator('#start-button')).toHaveText('再来一局');
  await page.locator('#start-button').click();
  await expect(page.locator('#status-label')).toHaveText('游戏进行中');
  await expect(page.locator('#score')).toHaveText('000000');
});

test('连连看难度切换、取消重开和超时恢复', async ({ page }) => {
  await page.goto('/#/games/link');
  await page.locator('[data-level="easy"]').click();
  await expect(page.locator('.tile')).toHaveCount(24);
  await page.clock.install();
  await page.locator('#start-button').click();
  await page.clock.runFor(2000);
  await page.locator('[data-level="hard"]').click();
  await expect(page.locator('#modal')).toBeVisible();
  await page.locator('#modal-cancel').click();
  await expect(page.locator('.tile')).toHaveCount(24);
  await page.locator('[data-level="hard"]').click();
  await page.locator('#modal-confirm').click();
  await expect(page.locator('.tile')).toHaveCount(64);
  await expect(page.locator('#timer')).toHaveText('03:00');
  await page.locator('#start-button').click();
  await page.clock.runFor(180200);
  await expect(page.locator('#timer')).toHaveText('00:00');
  await expect(page.locator('#overlay-title')).toHaveText('差一点点，也很棒');
  await expect(page.locator('#hint-button')).toBeDisabled();
  await expect(page.locator('#shuffle-button')).toBeDisabled();
  await page.locator('#overlay-action').click();
  await expect(page.locator('#board-overlay')).toBeHidden();
  await expect(page.locator('#timer')).toHaveText('03:00');
});

test('连连看玩法切换可取消，确认后重置并保留难度', async ({ page }) => {
  await page.addInitScript(() => { Math.random = () => 1 - Number.EPSILON; });
  await page.goto('/#/games/link');
  await page.locator('[data-level="easy"]').click();
  await page.clock.install();
  await page.locator('#start-button').click();
  await page.locator('.tile[data-row="0"][data-col="0"]').click();
  await page.locator('.tile[data-row="0"][data-col="1"]').click();
  await page.clock.runFor(300);
  await page.locator('[data-mode="zen"]').click();
  await expect(page.locator('#modal-title')).toHaveText('切换到悠闲模式？');
  const time = await page.locator('#timer').textContent();
  await page.clock.runFor(5000);
  await expect(page.locator('#timer')).toHaveText(time!);
  await page.locator('#modal-cancel').click();
  await expect(page.locator('[data-mode="classic"]')).toHaveAttribute('aria-pressed', 'true');
  await expect(page.locator('.tile.empty')).toHaveCount(2);
  await expect(page.locator('#score')).toHaveText('100分');
  await expect(page.locator('#board-overlay')).toBeHidden();
  await page.locator('[data-mode="zen"]').click();
  await page.locator('#modal-confirm').click();
  await expect(page.locator('[data-mode="zen"]')).toHaveAttribute('aria-pressed', 'true');
  await expect(page.locator('[data-level="easy"]')).toHaveAttribute('aria-pressed', 'true');
  await expect(page.locator('.tile')).toHaveCount(24);
  await expect(page.locator('.tile.empty')).toHaveCount(0);
  await expect(page.locator('#score')).toHaveText('0分');
  await expect(page.locator('#best-score')).toHaveText('0');
  await expect(page.locator('#timer')).toHaveText('不限时');
  await page.locator('[data-mode="classic"]').click();
  await expect(page.locator('#best-score')).toHaveText('100');
  await expect(page.locator('#timer')).toHaveText('03:00');
  await expect(page.locator('#hint-count')).toHaveText('5');
  await expectNoOverflow(page);
});

test('连连看悠闲模式长时间游玩和暂停后仍可使用无限道具', async ({ page }) => {
  await page.goto('/#/games/link');
  await page.locator('[data-mode="zen"]').click();
  await page.locator('[data-level="hard"]').click();
  await page.clock.install();
  await page.locator('#start-button').click();
  await page.clock.runFor(240000);
  await expect(page.locator('#board-overlay')).toBeHidden();
  await expect(page.locator('#timer')).toHaveText('不限时');
  await expect(page.locator('#timer')).not.toHaveClass(/urgent/);
  for (let use = 0; use < 7; use++) {
    await page.keyboard.press('h');
    await expect(page.locator('.tile.hinted')).toHaveCount(2);
    await page.keyboard.press('r');
    await expect(page.locator('.tile.hinted')).toHaveCount(0);
  }
  await expect(page.locator('#hint-count')).toHaveText('∞');
  await expect(page.locator('#shuffle-count')).toHaveText('∞');
  await expect(page.locator('#hint-button')).toBeEnabled();
  await expect(page.locator('#shuffle-button')).toBeEnabled();
  await page.locator('#start-button').click();
  await page.clock.runFor(240000);
  await expect(page.locator('#overlay-title')).toHaveText('休息一下');
  await expect(page.locator('#hint-button')).toBeDisabled();
  await page.locator('#overlay-action').click();
  await page.locator('#rules-button').click();
  await expect(page.locator('#modal-content')).toContainText('提示和洗牌不限次数');
  await expect(page.locator('#modal-content')).toContainText('不计时间奖励');
  await page.locator('#modal-confirm').click();
  await page.locator('#hint-button').click();
  const cells = await page.locator('.tile.hinted').evaluateAll(tiles => tiles.map(tile => tile.getAttribute('aria-label')!));
  for (const label of cells) await page.getByRole('button', { name: label, exact: true }).click();
  await page.clock.runFor(300);
  await expect(page.locator('.tile.empty')).toHaveCount(2);
  await expect(page.locator('#score')).toHaveText('100分');
  await page.locator('[data-mode="gravity"]').click();
  await page.locator('#modal-confirm').click();
  await expect(page.locator('#hint-count')).toHaveText('2');
  await expect(page.locator('#timer')).toHaveText('03:00');
  await page.locator('#start-button').click();
  await page.clock.runFor(180200);
  await expect(page.locator('#overlay-title')).toHaveText('差一点点，也很棒');
  await page.locator('#overlay-action').click();
  await expect(page.locator('[data-mode="gravity"]')).toHaveAttribute('aria-pressed', 'true');
  await expect(page.locator('#timer')).toHaveText('03:00');
});

test('连连看悠闲通关不加时间奖励，重玩和重新打开保留独立记录', async ({ page }) => {
  await page.addInitScript(() => { Math.random = () => 1 - Number.EPSILON; });
  await page.goto('/#/games/link');
  await page.locator('[data-mode="zen"]').click();
  await page.locator('[data-level="easy"]').click();
  await page.clock.install();
  await page.locator('#start-button').click();
  for (let row = 0; row < 4; row++) {
    for (let col = 0; col < 6; col += 2) {
      await page.locator(`.tile[data-row="${row}"][data-col="${col}"]`).click();
      await page.locator(`.tile[data-row="${row}"][data-col="${col + 1}"]`).click();
      await page.clock.runFor(6000);
    }
  }
  await expect(page.locator('#overlay-title')).toHaveText('小美好，全部收集！');
  await expect(page.locator('#overlay-description')).toContainText('悠闲模式不计时间奖励');
  await expect(page.locator('#score')).toHaveText('1,200分');
  await expect(page.locator('#best-score')).toHaveText('1,200');
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem('link-and-chill-records-zen')!)))
    .toEqual({ easy: 1200, normal: 0, hard: 0 });
  expect(await page.evaluate(() => localStorage.getItem('link-and-chill-records'))).toBeNull();
  await page.locator('#overlay-action').click();
  await expect(page.locator('.tile.empty')).toHaveCount(0);
  await expect(page.locator('#timer')).toHaveText('不限时');
  await expect(page.locator('[data-mode="zen"]')).toHaveAttribute('aria-pressed', 'true');
  await page.reload();
  await page.locator('[data-mode="zen"]').click();
  await expect(page.locator('#best-score')).toHaveText('0');
  await page.locator('[data-level="easy"]').click();
  await expect(page.locator('#best-score')).toHaveText('1,200');
});

test('连连看重力补位保持列顺序，提示和洗牌可用且能完整通关', async ({ page }) => {
  await page.addInitScript(() => { Math.random = () => 1 - Number.EPSILON; });
  await page.goto('/#/games/link');
  await page.locator('[data-mode="gravity"]').click();
  await page.locator('[data-level="easy"]').click();
  await page.clock.install();
  await page.locator('#start-button').click();
  const cell = (row: number, col: number) => page.locator(`.tile[data-row="${row}"][data-col="${col}"]`);
  await cell(3, 0).focus();
  await page.keyboard.press('Enter');
  await page.keyboard.press('Tab');
  await page.keyboard.press('Enter');
  await page.clock.runFor(300);
  await expect(cell(0, 0)).toHaveClass(/empty/);
  await expect(cell(0, 1)).toHaveClass(/empty/);
  await expect(cell(1, 0)).toHaveAttribute('aria-label', '樱桃，第2行第1列');
  await expect(cell(2, 0)).toHaveAttribute('aria-label', '柠檬，第3行第1列');
  await expect(cell(3, 0)).toHaveAttribute('aria-label', '樱桃，第4行第1列');
  await expect(cell(3, 2)).toBeFocused();
  await page.locator('#hint-button').click();
  await expect(page.locator('.tile.hinted')).toHaveCount(2);
  await expect(page.locator('#hint-count')).toHaveText('4');
  await page.locator('#shuffle-button').click();
  await expect(page.locator('.tile.hinted')).toHaveCount(0);
  await expect(page.locator('#shuffle-count')).toHaveText('4');
  await expect(cell(0, 0)).toHaveClass(/empty/);
  await expect(cell(0, 1)).toHaveClass(/empty/);
  for (let col = 0; col < 6; col += 2) {
    for (let pair = col === 0 ? 1 : 0; pair < 4; pair++) {
      await cell(3, col).click();
      await cell(3, col + 1).click();
      await page.clock.runFor(300);
    }
  }
  await expect(page.locator('.tile.empty')).toHaveCount(24);
  await expect(page.locator('#overlay-title')).toHaveText('小美好，全部收集！');
  const score = Number((await page.locator('#score').textContent())!.replace(/\D/g, ''));
  expect(score).toBeGreaterThan(1200);
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem('link-and-chill-records-gravity')!).easy)).toBe(score);
  await page.locator('[data-mode="classic"]').click();
  await expect(page.locator('#best-score')).toHaveText('0');
  await expectNoOverflow(page);
});

test('连连看重力配对后立即切换玩法不把下落动画带入新棋盘', async ({ page }) => {
  await page.addInitScript(() => { Math.random = () => 1 - Number.EPSILON; });
  await page.goto('/#/games/link');
  await page.locator('[data-mode="gravity"]').click();
  await page.clock.install();
  await page.clock.pauseAt(new Date(Date.now() + 1000));
  await page.locator('.tile[data-row="5"][data-col="0"]').click();
  await page.locator('.tile[data-row="5"][data-col="1"]').click();
  await expect(page.locator('#board')).toHaveClass(/locked/);
  await page.locator('[data-mode="zen"]').click();
  await page.locator('#modal-confirm').click();
  await page.clock.runFor(1000);
  await expect(page.locator('#board')).not.toHaveClass(/locked/);
  await expect(page.locator('.tile.empty')).toHaveCount(0);
  await expect(page.locator('#score')).toHaveText('0分');
  await expect(page.locator('#timer')).toHaveText('不限时');
  await expect(page.locator('#start-button')).toHaveText('开始游戏');
  await expect(page.locator('#connection-line')).toHaveAttribute('points', '');
});

test('连连看清空棋盘通关并保存最高分', async ({ page }) => {
  await page.addInitScript(() => { Math.random = () => 1 - Number.EPSILON; });
  await page.goto('/#/games/link');
  await page.locator('[data-level="easy"]').click();
  await page.clock.install();
  await page.locator('#start-button').click();
  for (let row = 0; row < 4; row++) {
    for (let col = 0; col < 6; col += 2) {
      await page.locator(`.tile[data-row="${row}"][data-col="${col}"]`).click();
      await page.locator(`.tile[data-row="${row}"][data-col="${col + 1}"]`).click();
      await page.clock.runFor(300);
    }
  }
  await expect(page.locator('.tile.empty')).toHaveCount(24);
  await expect(page.locator('#overlay-title')).toHaveText('小美好，全部收集！');
  const score = await page.locator('#score').textContent();
  await expect(page.locator('#best-score')).toHaveText(score!.replace(/分/g, ''));
  await page.locator('#overlay-action').click();
  await expect(page.locator('.tile.empty')).toHaveCount(0);
  await expect(page.locator('#score')).toHaveText('0分');
});

test('连连看提示配对、暂停计时、洗牌与离开清理', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto('/#/games/link');
  await expect(page.locator('#start-button')).toBeVisible();
  await page.clock.install();
  await page.locator('#start-button').click();
  await page.locator('#hint-button').click();
  await expect(page.locator('.tile.hinted')).toHaveCount(2);
  const hintCells = await page.locator('.tile.hinted').evaluateAll((tiles) => tiles.map((tile) => ({
    row: tile.getAttribute('data-row'), col: tile.getAttribute('data-col'), label: tile.getAttribute('aria-label')!,
  })));
  await expect(page.locator('#game-message')).toHaveAttribute('role', 'status');
  for (const cell of hintCells) {
    const [fruit, position] = cell.label.split('，');
    await expect(page.locator('#game-message')).toContainText(fruit!);
    await expect(page.locator('#game-message')).toContainText(position!);
  }
  for (const cell of hintCells) {
    await page.getByRole('button', { name: cell.label, exact: true }).click();
  }
  await expect(page.locator('#connection-line')).toHaveAttribute('points', /\d[\d., ]+\d/);
  await page.clock.runFor(600);
  await expect(page.locator('.tile.empty')).toHaveCount(2);
  await expect.poll(async () => Number((await page.locator('#score').textContent())?.replace(/\D/g, ''))).toBeGreaterThanOrEqual(100);
  await page.locator('#start-button').click();
  await expect(page.locator('#board-overlay')).toBeVisible();
  const time = await page.locator('#timer').textContent();
  await page.clock.runFor(5000);
  await expect(page.locator('#timer')).toHaveText(time!);
  await page.locator('#overlay-action').click();
  await expect(page.locator('#board-overlay')).toBeHidden();
  const shuffles = Number(await page.locator('#shuffle-count').textContent());
  await page.locator('#shuffle-button').click();
  await expect(page.locator('#shuffle-count')).toHaveText(String(shuffles - 1));
  await expect(page.locator('.tile.empty')).toHaveCount(2);
  await page.getByRole('link', { name: '返回大厅' }).click();
  await page.clock.runFor(200000);
  await page.getByRole('link', { name: '开始玩连连看', exact: true }).click();
  await expect(page.locator('#timer')).toHaveText('03:00');
  await expect(page.locator('#hint-button')).toBeDisabled();
  expect(errors).toEqual([]);
});

for (const delayStorageEvent of [false, true]) {
  test(`贪吃蛇跨标签页最高分不被设置覆盖${delayStorageEvent ? '（存储事件未到达）' : '并实时同步'}`, async ({ page, context }) => {
    await page.addInitScript(() => { Math.random = () => 0; });
    await page.goto('/#/games/snake');
    await expect(page.locator('#start-button')).toBeVisible();
    const other = await context.newPage();
    if (delayStorageEvent) await other.addInitScript(() => {
      window.addEventListener('storage', (event) => event.stopImmediatePropagation());
    });
    await other.goto('/#/games/snake');
    await other.locator('[data-level="easy"]').click();
    await page.clock.install();
    await page.locator('#start-button').click();
    await page.clock.runFor(1430);
    await expect(page.locator('#best-score')).toHaveText('10');
    await page.locator('#pause-button').click();
    if (!delayStorageEvent) await expect(other.locator('#best-score')).toHaveText('10');
    await expect(other.locator('#game-status')).toHaveAttribute('data-state', 'ready');
    await expect(other.locator('[data-level="easy"]')).toHaveAttribute('aria-pressed', 'true');
    await other.locator('#sound-button').click();
    await expect(other.locator('#best-score')).toHaveText('10');
    expect(await page.evaluate(() => JSON.parse(localStorage.getItem('little-break-snake')!).best)).toBe(10);
    await other.close();
  });
}

for (const delayStorageEvent of [false, true]) {
  test(`连连看跨标签页合并不同难度最高分${delayStorageEvent ? '（存储事件未到达）' : '并实时同步'}`, async ({ page, context }) => {
    await context.addInitScript(() => { Math.random = () => 1 - Number.EPSILON; });
    await page.goto('/#/games/link');
    await expect(page.locator('#start-button')).toBeVisible();
    const other = await context.newPage();
    if (delayStorageEvent) await other.addInitScript(() => {
      window.addEventListener('storage', (event) => event.stopImmediatePropagation());
    });
    await other.goto('/#/games/link');
    await page.locator('#start-button').click();
    await page.locator('.tile[data-row="0"][data-col="0"]').click();
    await page.locator('.tile[data-row="0"][data-col="1"]').click();
    await expect(page.locator('#score')).toHaveText('100分');
    if (!delayStorageEvent) await expect(other.locator('#best-score')).toHaveText('100');
    await other.locator('[data-level="easy"]').click();
    await expect(other.locator('.tile')).toHaveCount(24);
    await other.locator('#start-button').click();
    await other.locator('.tile[data-row="0"][data-col="0"]').click();
    await other.locator('.tile[data-row="0"][data-col="1"]').click();
    await expect(other.locator('#score')).toHaveText('100分');
    expect(await other.evaluate(() => JSON.parse(localStorage.getItem('link-and-chill-records')!))).toEqual({ easy: 100, normal: 100, hard: 0 });
    await expect(page.locator('.tile.empty')).toHaveCount(2);
    await expect(page.locator('#score')).toHaveText('100分');
    await other.close();
  });
}

for (const key of ['Enter', 'Space']) {
  test(`连连看${key}配对后可直接继续键盘操作`, async ({ page }) => {
    await page.addInitScript(() => { Math.random = () => 1 - Number.EPSILON; });
    await page.goto('/#/games/link');
    await page.locator('[data-level="easy"]').click();
    await page.clock.install();
    await page.locator('#start-button').click();
    await page.locator('.tile[data-row="0"][data-col="0"]').focus();
    await page.keyboard.press(key);
    await page.keyboard.press('Tab');
    await page.keyboard.press(key);
    await page.clock.runFor(300);
    await expect(page.locator('.tile.empty')).toHaveCount(2);
    await expect(page.locator('.tile[data-row="0"][data-col="2"]')).toBeFocused();
    await page.keyboard.press(key);
    await page.keyboard.press('Tab');
    await page.keyboard.press(key);
    await page.clock.runFor(300);
    await expect(page.locator('.tile.empty')).toHaveCount(4);
    await expect(page.locator('.tile[data-row="0"][data-col="4"]')).toBeFocused();
    for (let pair = 2; pair < 12; pair++) {
      await page.keyboard.press(key);
      await page.keyboard.press('Tab');
      await page.keyboard.press(key);
      await page.clock.runFor(300);
    }
    await expect(page.locator('.tile.empty')).toHaveCount(24);
    await expect(page.locator('#overlay-action')).toBeFocused();
  });
}

test('连连看配对动画结束不抢走已移至其他控件的焦点', async ({ page }) => {
  await page.addInitScript(() => { Math.random = () => 1 - Number.EPSILON; });
  await page.goto('/#/games/link');
  await page.clock.install();
  await page.locator('#start-button').click();
  await page.locator('.tile[data-row="0"][data-col="0"]').focus();
  await page.keyboard.press('Enter');
  await page.keyboard.press('Tab');
  await page.keyboard.press('Enter');
  await page.locator('#sound-button').focus();
  await page.clock.runFor(300);
  await expect(page.locator('#sound-button')).toBeFocused();
});

test('连连看重复键盘提示更新播报，暂停和用尽后不消耗提示', async ({ page }) => {
  await page.addInitScript(() => { Math.random = () => 1 - Number.EPSILON; });
  await page.goto('/#/games/link');
  await page.clock.install();
  await page.locator('#start-button').click();
  await page.locator('#hint-button').focus();
  const message = page.locator('#game-message');
  for (const remaining of [2, 1]) {
    await page.keyboard.press('h');
    await expect(message).toHaveText(`提示：樱桃，第1行第1列与第1行第2列可以配对。剩余${remaining}次提示。`);
    await expect(page.locator('#hint-count')).toHaveText(String(remaining));
    await expect(page.locator('#hint-button')).toBeFocused();
  }
  await page.locator('#start-button').click();
  await page.keyboard.press('h');
  await expect(message).toHaveText('已为你暂停计时，准备好后再继续。');
  await expect(page.locator('#hint-count')).toHaveText('1');
  await page.locator('#start-button').click();
  await page.keyboard.press('h');
  await expect(message).toHaveText('提示：樱桃，第1行第1列与第1行第2列可以配对。剩余0次提示。');
  await expect(page.locator('#hint-button')).toBeDisabled();
  await page.keyboard.press('h');
  await expect(page.locator('#hint-count')).toHaveText('0');
  await page.clock.runFor(4500);
  await expect(page.locator('.tile.hinted')).toHaveCount(0);
  await expect(message).toContainText('第1行第1列与第1行第2列');
});

test('大厅游戏说明和操作提示在手机、平板及桌面清晰且不挤压入口', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('.game-card-link')).toHaveCount(entries.length);
  for (const width of [320, 393, 768, 1024, 1440]) {
    await page.setViewportSize({ width, height: 1000 });
    await expectNoOverflow(page);
    const styles = await page.locator('.card-description, .card-controls').evaluateAll(elements => {
      function luminance(color: string) {
        const [r, g, b] = color.match(/[\d.]+/g)!.slice(0, 3).map(value => {
          const channel = Number(value) / 255;
          return channel <= .04045 ? channel / 12.92 : ((channel + .055) / 1.055) ** 2.4;
        });
        return .2126 * r + .7152 * g + .0722 * b;
      }
      return elements.map(element => {
        const style = getComputedStyle(element);
        const foreground = luminance(style.color);
        const background = luminance(getComputedStyle(element.closest('.game-card-link')!).backgroundColor);
        return {
          size: parseFloat(style.fontSize), minimum: element.classList.contains('card-description') ? 12 : 11,
          contrast: (Math.max(foreground, background) + .05) / (Math.min(foreground, background) + .05),
        };
      });
    });
    for (const style of styles) {
      expect(style.size).toBeGreaterThanOrEqual(style.minimum);
      expect(style.contrast).toBeGreaterThanOrEqual(4.5);
    }
    const overlaps = await page.locator('.card-bottom').evaluateAll(elements => elements.filter(element => {
      const controls = element.querySelector('.card-controls')!.getBoundingClientRect();
      const action = element.querySelector('.play-link')!.getBoundingClientRect();
      const card = element.closest('.game-card-link')!.getBoundingClientRect();
      return controls.left < card.left || action.right > card.right ||
        (controls.left < action.right && controls.right > action.left && controls.top < action.bottom && controls.bottom > action.top);
    }).length);
    expect(overlaps).toBe(0);
  }
});
