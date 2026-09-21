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

test('大厅展示全部入口，游戏可进入、返回及刷新', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto('/');
  await expect(page.locator('.game-card-link')).toHaveCount(entries.length);
  await expectNoOverflow(page);
  for (const game of entries) {
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
  }
  await page.goto('/#/not-a-game');
  await expect(page.locator('.lobby')).toBeVisible();
  expect(errors).toEqual([]);
});

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
  const hintCells = await page.locator('.tile.hinted').evaluateAll((tiles) => tiles.map((tile) => ({ row: tile.getAttribute('data-row'), col: tile.getAttribute('data-col') })));
  for (const cell of hintCells) {
    await page.locator(`.tile[data-row="${cell.row}"][data-col="${cell.col}"]`).click();
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
