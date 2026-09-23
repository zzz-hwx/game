import { test, expect } from '@playwright/test';
import type { JSHandle, Page } from '@playwright/test';
import { MAZES, PacmanGame } from '../src/games/pacman/engine';
import type { Direction } from '../src/games/pacman/engine';

const keys: Record<Direction, string> = { up: 'ArrowUp', left: 'ArrowLeft', down: 'ArrowDown', right: 'ArrowRight' };

type GameHandle = JSHandle<PacmanGame>;

// Test-only access to Vue's reactive engine; no product hooks or direct calls to tick/start.
async function liveGame(page: Page): Promise<GameHandle> {
  return page.locator('.pacman-board').evaluateHandle(board => {
    const component = (board as HTMLElement & {
      __vueParentComponent?: { setupState: { game: PacmanGame } };
    }).__vueParentComponent;
    if (!component?.setupState.game) throw new Error('Pacman Vue engine is unavailable');
    return component.setupState.game;
  });
}

function mapSteps(map: readonly string[], from: number): { direction: Direction; cell: number }[] {
  const vectors: [Direction, number, number][] = [['up', 0, -1], ['left', -1, 0], ['down', 0, 1], ['right', 1, 0]];
  const width = map[0].length;
  return vectors.flatMap(([direction, dx, dy]) => {
    let x = from % width + dx;
    const y = Math.floor(from / width) + dy;
    if (y < 0 || y >= map.length) return [];
    if (x < 0 || x >= width) {
      if (y !== 9) return [];
      x = (x + width) % width;
    }
    return map[y][x] === '#' ? [] : [{ direction, cell: y * width + x }];
  });
}

async function expectNoOverflow(page: Page): Promise<void> {
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  const bounds = (await page.locator('.pacman-board').boundingBox())!;
  expect(bounds.x).toBeGreaterThanOrEqual(0);
  expect(bounds.x + bounds.width).toBeLessThanOrEqual(page.viewportSize()!.width + 1);
  expect(await page.locator('.board-heading').evaluate(node => node.scrollWidth <= node.clientWidth)).toBe(true);
}

async function expectMazeWalls(page: Page, index: number): Promise<void> {
  // Cell centers avoid antialiasing when sampling the renderer's #344e3b wall fill.
  await page.clock.runFor(16);
  const walls = await page.locator('.pacman-board canvas').evaluate((node: HTMLCanvasElement) => {
    const ctx = node.getContext('2d')!;
    return Array.from({ length: 19 * 21 }, (_, cell) => {
      const x = Math.floor((cell % 19 + .5) * node.width / 19);
      const y = Math.floor((Math.floor(cell / 19) + .5) * node.height / 21);
      const [r, g, b, a] = ctx.getImageData(x, y, 1, 1).data;
      return r === 52 && g === 78 && b === 59 && a === 255;
    });
  });
  expect(walls, `canvas must draw the walls of maze ${index + 1}`).toEqual([...MAZES[index].map.join('')].map(tile => tile === '#'));
}

async function expectFreshMaze(page: Page, engine: GameHandle, level: number): Promise<void> {
  const index = (level - 1) % MAZES.length;
  const maze = MAZES[index];
  const tiles = [...maze.map.join('')];
  const cells = (symbol: string) => tiles.flatMap((tile, cell) => tile === symbol ? [cell] : []);
  await expect(page.locator('.board-heading')).toContainText(maze.name);
  await expect(page.locator('.classic-tag')).toContainText(`${String(index + 1).padStart(2, '0')} / 08`);
  await expect(page.locator('#pacman-level')).toHaveText(new RegExp(`^${String(level).padStart(2, '0')}\\s*/\\s*∞$`));
  expect(await page.locator('.pacman-board canvas').getAttribute('aria-label')).toContain(maze.name);
  expect(await engine.evaluate(game => ({
    level: game.level, index: game.mazeIndex, name: game.maze.name,
    tiles: [...game.tiles], walls: [...game.walls], spawn: game.spawn, player: game.player,
    pellets: [...game.pellets], powerPellets: [...game.powerPellets],
    total: game.totalPellets, remaining: game.remaining, interval: game.interval,
    ticks: game.ticks, powerTicks: game.powerTicks, combo: game.combo, protection: game.invulnerableTicks,
    direction: game.direction, queuedDirection: game.queuedDirection,
    ghosts: game.ghosts.map(ghost => ({ ...ghost })),
  }))).toEqual({
    level, index, name: maze.name, tiles, walls: cells('#'), spawn: tiles.indexOf('P'), player: tiles.indexOf('P'),
    pellets: cells('.'), powerPellets: cells('o'), total: cells('.').length + 4, remaining: cells('.').length + 4,
    interval: Math.max(105, 150 - (level - 1) * 10), ticks: 0, powerTicks: 0, combo: 0, protection: 14,
    direction: 'left', queuedDirection: 'left',
    ghosts: tiles.flatMap((tile, home) => /[123]/.test(tile) ? [{ cell: home, home, direction: 'up', cooldown: Number(tile) * 5 }] : []),
  });
  await expect(page.locator('#pacman-remaining')).toHaveText(String(cells('.').length + 4));
  await expect(page.locator('.pacman-board')).toHaveAttribute('data-player', String(tiles.indexOf('P')));
  await expectMazeWalls(page, index);
  await expectNoOverflow(page);
}

async function movePauseResume(page: Page, engine: GameHandle, index: number): Promise<void> {
  const board = page.locator('.pacman-board');
  const before = await engine.evaluate(game => {
    game.ghosts = [];
    return { player: game.player, score: game.score, remaining: game.remaining, pellets: [...game.pellets], power: [...game.powerPellets] };
  });
  const step = mapSteps(MAZES[index].map, before.player)[0];
  expect(step).toBeDefined();
  const points = before.pellets.includes(step.cell) ? 10 : before.power.includes(step.cell) ? 50 : 0;
  await board.focus();
  await page.keyboard.press(keys[step.direction]);
  await advanceOneTick(page);
  await expect(board).toHaveAttribute('data-player', String(step.cell));
  await expect(board).toHaveAttribute('data-direction', step.direction);
  await expect(page.locator('#pacman-score')).toHaveText(String(before.score + points).padStart(4, '0'));
  await expect(page.locator('#pacman-remaining')).toHaveText(String(before.remaining - (points ? 1 : 0)));
  await page.keyboard.press('Space');
  await expect(board).toHaveAttribute('data-state', 'paused');
  const frozen = await engine.evaluate(game => ({ player: game.player, ticks: game.ticks, score: game.score, remaining: game.remaining, power: game.powerTicks }));
  await page.clock.runFor(5000);
  await page.keyboard.press(keys[step.direction]);
  expect(await engine.evaluate(game => ({ player: game.player, ticks: game.ticks, score: game.score, remaining: game.remaining, power: game.powerTicks }))).toEqual(frozen);
  await page.locator('#pacman-overlay-action').click();
  await expect(board).toHaveAttribute('data-state', 'playing');
}

async function finishMaze(page: Page, engine: GameHandle): Promise<number> {
  const before = await engine.evaluate(game => ({ player: game.player, score: game.score, index: game.mazeIndex, lives: game.lives }));
  const step = mapSteps(MAZES[before.index].map, before.player)[0];
  // Only shorten the remaining collection; a real key and the production clock must win.
  await engine.evaluate((game, target) => {
    game.ghosts = [];
    game.pellets = new Set([target]);
    game.powerPellets = new Set();
    game.totalPellets = 1;
  }, step.cell);
  await page.locator('.pacman-board').focus();
  await page.keyboard.press(keys[step.direction]);
  await advanceOneTick(page);
  await expect(page.locator('.pacman-board')).toHaveAttribute('data-state', 'won');
  await expect(page.locator('.pacman-board')).toHaveAttribute('data-player', String(step.cell));
  await expect(page.locator('#pacman-remaining')).toHaveText('0');
  await expect(page.locator('.lives')).toHaveAttribute('data-lives', String(before.lives));
  const score = before.score + 510;
  await expect(page.locator('#pacman-score')).toHaveText(String(score).padStart(4, '0'));
  await expect(page.locator('#pacman-best')).toHaveText(String(score).padStart(4, '0'));
  await expect(page.locator('.overlay-card p')).toContainText(MAZES[(before.index + 1) % 8].name);
  await expect(page.locator('.overlay-card p')).toContainText('+500');
  if (before.index === 7) await expect(page.locator('.overlay-card p')).toContainText('新一轮');
  await page.clock.runFor(1000);
  await expect(page.locator('#pacman-score')).toHaveText(String(score).padStart(4, '0'));
  await expectNoOverflow(page);
  return score;
}

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

test('八张地图逐关操作、暂停、重绘并循环到第九关，桌面与窄屏无溢出', async ({ page, isMobile }) => {
  test.setTimeout(60000);
  if (isMobile) await page.setViewportSize({ width: 320, height: 740 });
  expect(MAZES).toHaveLength(8);
  const engine = await liveGame(page);
  let score = 0;
  for (let level = 1; level <= 8; level++) {
    await expectFreshMaze(page, engine, level);
    await expect(page.locator('#pacman-score')).toHaveText(String(score).padStart(4, '0'));
    await expect(page.locator('.lives')).toHaveAttribute('data-lives', '3');
    await movePauseResume(page, engine, level - 1);
    score = await finishMaze(page, engine);
    await page.locator('#pacman-overlay-action').click();
    await expect(page.locator('.pacman-board')).toHaveAttribute('data-state', 'playing');
  }
  await expectFreshMaze(page, engine, 9);
  await expect(page.locator('#pacman-score')).toHaveText(String(score).padStart(4, '0'));
  await expect(page.locator('#pacman-best')).toHaveText(String(score).padStart(4, '0'));
  await expect(page.locator('.lives')).toHaveAttribute('data-lives', '3');
  await movePauseResume(page, engine, 0);
  await engine.dispose();
});

test('非首张地图重开还原第一关墙体和出生点，最高分跨重开与刷新保留', async ({ page, isMobile }) => {
  if (isMobile) await page.setViewportSize({ width: 320, height: 740 });
  const engine = await liveGame(page);
  for (let level = 1; level <= 2; level++) {
    await expectFreshMaze(page, engine, level);
    await movePauseResume(page, engine, level - 1);
    await finishMaze(page, engine);
    await page.locator('#pacman-overlay-action').click();
  }
  await expectFreshMaze(page, engine, 3);
  await movePauseResume(page, engine, 2);
  const best = (await page.locator('#pacman-best').textContent())!;
  expect(Number(best)).toBeGreaterThan(1000);
  await page.keyboard.press('KeyR');
  await expect(page.getByRole('dialog')).toBeVisible();
  await expect(page.locator('.pacman-board')).toHaveAttribute('data-state', 'paused');
  await page.getByRole('button', { name: '确定重开', exact: true }).click();
  await expect(page.locator('.pacman-board')).toHaveAttribute('data-state', 'ready');
  await expectFreshMaze(page, engine, 1);
  await expect(page.locator('#pacman-score')).toHaveText('0000');
  await expect(page.locator('.lives')).toHaveAttribute('data-lives', '3');
  await expect(page.locator('#pacman-best')).toHaveText(best);
  await engine.dispose();
  await page.reload();
  const reloaded = await liveGame(page);
  await expectFreshMaze(page, reloaded, 1);
  await expect(page.locator('#pacman-best')).toHaveText(best);
  await expect(page.locator('#pacman-score')).toHaveText('0000');
  await reloaded.dispose();
});

test('非首张地图掉命后在当前出生点复活，不补回已吃豆子或切回首图', async ({ page }) => {
  const engine = await liveGame(page);
  const index = 2;
  const tiles = [...MAZES[index].map.join('')];
  const pellets = tiles.flatMap((tile, cell) => tile === '.' ? [cell] : []);
  const target = pellets[1];
  const from = mapSteps(MAZES[index].map, target)[0].cell;
  const step = mapSteps(MAZES[index].map, from).find(step => step.cell === target)!;
  const fixture = await engine.evaluate((game, { index, from, target, eaten, direction }) => {
    for (let i = 0; i < index; i++) {
      game.status = 'won';
      game.nextLevel();
    }
    const ghosts = game.ghosts.map(ghost => ({ ...ghost }));
    game.pellets.delete(eaten);
    game.powerPellets.delete([...game.powerPellets][0]);
    game.score = 120;
    game.player = from;
    game.direction = direction;
    game.queuedDirection = direction;
    game.invulnerableTicks = 0;
    game.ticks = 10;
    game.ghosts = [{ cell: target, home: ghosts[0].home, direction: 'left', cooldown: 0 }];
    game.status = 'paused';
    return { spawn: game.spawn, total: game.totalPellets, pellets: [...game.pellets].filter(cell => cell !== target), power: [...game.powerPellets], ghosts };
  }, { index, from, target, eaten: pellets[0], direction: step.direction });
  await page.locator('#pacman-overlay-action').click();
  await page.keyboard.press(keys[step.direction]);
  await advanceOneTick(page);
  await expect(page.locator('.pacman-board')).toHaveAttribute('data-state', 'life-lost');
  await expect(page.locator('.pacman-board')).toHaveAttribute('data-player', String(fixture.spawn));
  await expect(page.locator('.lives')).toHaveAttribute('data-lives', '2');
  await expect(page.locator('#pacman-score')).toHaveText('0130');
  await expect(page.locator('#pacman-remaining')).toHaveText(String(fixture.total - 3));
  await expect(page.locator('.board-heading')).toContainText(MAZES[index].name);
  await expect(page.locator('.classic-tag')).toContainText('03 / 08');
  await expect(page.locator('#pacman-level')).toHaveText(/^03\s*\/\s*∞$/);
  expect(await page.locator('.pacman-board canvas').getAttribute('aria-label')).toContain(MAZES[index].name);
  const state = await engine.evaluate(game => ({
    index: game.mazeIndex, tiles: [...game.tiles], pellets: [...game.pellets], power: [...game.powerPellets],
    total: game.totalPellets, player: game.player, protection: game.invulnerableTicks,
    ticks: game.ticks, powerTicks: game.powerTicks, combo: game.combo, ghosts: game.ghosts.map(ghost => ({ ...ghost })),
  }));
  expect(state).toEqual({
    index, tiles, pellets: fixture.pellets, power: fixture.power, total: fixture.total,
    player: fixture.spawn, protection: 14, ticks: 0, powerTicks: 0, combo: 0, ghosts: fixture.ghosts,
  });
  await expectMazeWalls(page, index);
  await page.clock.runFor(5000);
  await expect(page.locator('.pacman-board')).toHaveAttribute('data-player', String(fixture.spawn));
  await expect(page.locator('#pacman-remaining')).toHaveText(String(fixture.total - 3));
  await page.locator('#pacman-overlay-action').click();
  await expect(page.locator('.pacman-board')).toHaveAttribute('data-state', 'playing');
  expect(await engine.evaluate(game => [...game.pellets])).toEqual(fixture.pellets);
  await movePauseResume(page, engine, index);
  await engine.dispose();
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

for (const scenario of ['blur', 'hidden', 'paused', 'focused'] as const) {
  test(`重开弹窗 Escape 取消保留正确暂停状态：${scenario}`, async ({ page }) => {
    const board = page.locator('.pacman-board');
    await page.locator('#pacman-overlay-action').click();
    await advanceOneTick(page);
    if (scenario === 'paused') await page.keyboard.press('Space');
    await page.locator('#pacman-restart').click();
    await expect(page.getByRole('dialog')).toBeVisible();
    await expect(board).toHaveAttribute('data-state', 'paused');
    const player = await board.getAttribute('data-player');
    const ticks = await board.getAttribute('data-ticks');
    const score = (await page.locator('#pacman-score').textContent())!;
    if (scenario === 'blur') await page.evaluate(() => window.dispatchEvent(new Event('blur')));
    if (scenario === 'hidden') {
      await page.evaluate(() => {
        Object.defineProperty(document, 'hidden', { configurable: true, value: true });
        document.dispatchEvent(new Event('visibilitychange'));
        Reflect.deleteProperty(document, 'hidden');
        document.dispatchEvent(new Event('visibilitychange'));
      });
    }
    await page.keyboard.press('Escape');
    await expect(page.getByRole('dialog')).toBeHidden();
    await expect(board).toHaveAttribute('data-state', scenario === 'focused' ? 'playing' : 'paused');
    if (scenario === 'focused') await advanceOneTick(page);
    else {
      await page.clock.runFor(1000);
      await expect(board).toHaveAttribute('data-player', player!);
      await expect(board).toHaveAttribute('data-ticks', ticks!);
      await expect(page.locator('#pacman-score')).toHaveText(score);
      await page.locator('#pacman-overlay-action').click();
      await advanceOneTick(page);
    }
  });
}

test('双页面交错保存：storage 事件未送达时低分也不能覆盖最新高分', async ({ page, context }) => {
  const key = 'little-break-pacman-best-v1';
  const other = await context.newPage();
  await other.goto('/#/games/pacman');
  await expect(other.locator('.pacman-board')).toHaveAttribute('data-state', 'ready');
  await page.getByRole('link', { name: '返回大厅' }).click();
  // Install before mounting: window storage listeners run in registration order.
  const deliveries = await page.evaluateHandle(key => {
    const events = { count: 0 };
    window.addEventListener('storage', event => {
      if (event.key === key) { events.count++; event.stopImmediatePropagation(); }
    }, true);
    return events;
  }, key);
  await page.getByRole('link', { name: '开始玩吃豆人', exact: true }).click();
  await expect(page.locator('.pacman-board')).toHaveAttribute('data-state', 'ready');
  await other.evaluate(key => localStorage.setItem(key, '5000'), key);
  await expect.poll(async () => (await deliveries.jsonValue()).count).toBe(1);
  await expect(page.locator('#pacman-best')).toHaveText('0000');
  await page.locator('#pacman-overlay-action').click();
  await advanceOneTick(page);
  await expect(page.locator('#pacman-score')).toHaveText('0010');
  expect(await other.evaluate(key => localStorage.getItem(key), key)).toBe('5000');
  await expect(page.locator('#pacman-best')).toHaveText('5000');
  await other.close();
});

test('双页面原生 storage 同步只更新纪录，不改变游戏和输入或回写存储', async ({ page, context }) => {
  const key = 'little-break-pacman-best-v1';
  const other = await context.newPage();
  await other.goto('/#/games/pacman');
  await expect(other.locator('.pacman-board')).toHaveAttribute('data-state', 'ready');
  await page.locator('#pacman-overlay-action').click();
  await advanceOneTick(page);
  await expect(other.locator('#pacman-best')).toHaveText('0010');
  await expect(other.locator('.pacman-board')).toHaveAttribute('data-state', 'ready');
  await expect(other.locator('#pacman-score')).toHaveText('0000');
  const board = page.locator('.pacman-board');
  const player = await board.getAttribute('data-player');
  const ticks = await board.getAttribute('data-ticks');
  const direction = await board.getAttribute('data-direction');
  const calls = await page.evaluateHandle(key => {
    const calls = { reads: 0, writes: 0, events: 0 };
    const get = Storage.prototype.getItem;
    const set = Storage.prototype.setItem;
    Storage.prototype.getItem = function (name) { if (name === key) calls.reads++; return get.call(this, name); };
    Storage.prototype.setItem = function (name, value) { if (name === key) calls.writes++; return set.call(this, name, value); };
    window.addEventListener('storage', event => { if (event.key === key) calls.events++; });
    return calls;
  }, key);
  for (const [index, value] of ['5000', '10', '-1', 'NaN', '1.5', 'Infinity', '9007199254740992'].entries()) {
    await other.evaluate(({ key, value }) => localStorage.setItem(key, value), { key, value });
    await expect.poll(async () => (await calls.jsonValue()).events).toBe(index + 1);
    await expect(page.locator('#pacman-best')).toHaveText('5000');
  }
  await expect(board).toHaveAttribute('data-state', 'playing');
  await expect(board).toHaveAttribute('data-player', player!);
  await expect(board).toHaveAttribute('data-ticks', ticks!);
  await expect(board).toHaveAttribute('data-direction', direction!);
  await expect(page.locator('#pacman-score')).toHaveText('0010');
  await advanceOneTick(page);
  await expect(page.locator('#pacman-score')).toHaveText('0020');
  expect(await calls.jsonValue()).toEqual({ reads: 0, writes: 0, events: 7 });
  await other.close();
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
