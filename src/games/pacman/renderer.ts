import type { PacmanGame, Direction } from './engine';

export const CELL = 24;
export const GHOST_COLORS = ['#e9a0a1', '#9fcbd0', '#b7acd9'];
const angles: Record<Direction, number> = { right: 0, down: Math.PI / 2, left: Math.PI, up: -Math.PI / 2 };
type RenderState = Pick<PacmanGame, 'width' | 'height' | 'walls' | 'pellets' | 'powerPellets' | 'player' | 'direction' | 'status' | 'invulnerableTicks' | 'ticks' | 'ghosts' | 'powerTicks'>;

export function drawGame(ctx: CanvasRenderingContext2D, game: RenderState, fromPlayer: number, fromGhosts: number[], progress: number, time: number): void {
  const width = game.width * CELL;
  const height = game.height * CELL;
  ctx.clearRect(0, 0, width, height);
  ctx.fillStyle = '#24392f';
  ctx.fillRect(0, 0, width, height);
  ctx.lineWidth = 1.3;
  ctx.strokeStyle = '#759a70';
  ctx.lineCap = 'round';
  for (const cell of game.walls) {
    const x = cell % game.width * CELL;
    const y = Math.floor(cell / game.width) * CELL;
    const col = cell % game.width;
    const top = game.walls.has(cell - game.width);
    const bottom = game.walls.has(cell + game.width);
    const left = col > 0 && game.walls.has(cell - 1);
    const right = col < game.width - 1 && game.walls.has(cell + 1);
    ctx.fillStyle = '#344e3b';
    ctx.beginPath();
    ctx.roundRect(x + (left ? 0 : 4), y + (top ? 0 : 4), CELL - (left ? 0 : 4) - (right ? 0 : 4), CELL - (top ? 0 : 4) - (bottom ? 0 : 4), [top || left ? 0 : 4, top || right ? 0 : 4, bottom || right ? 0 : 4, bottom || left ? 0 : 4]);
    ctx.fill();
    ctx.beginPath();
    if (!top) { ctx.moveTo(x + (left ? 0 : 7), y + 4); ctx.lineTo(x + (right ? CELL : CELL - 7), y + 4); }
    if (!bottom) { ctx.moveTo(x + (left ? 0 : 7), y + CELL - 4); ctx.lineTo(x + (right ? CELL : CELL - 7), y + CELL - 4); }
    if (!left) { ctx.moveTo(x + 4, y + (top ? 0 : 7)); ctx.lineTo(x + 4, y + (bottom ? CELL : CELL - 7)); }
    if (!right) { ctx.moveTo(x + CELL - 4, y + (top ? 0 : 7)); ctx.lineTo(x + CELL - 4, y + (bottom ? CELL : CELL - 7)); }
    if (!top && !left) { ctx.moveTo(x + 4, y + 7); ctx.quadraticCurveTo(x + 4, y + 4, x + 7, y + 4); }
    if (!top && !right) { ctx.moveTo(x + CELL - 7, y + 4); ctx.quadraticCurveTo(x + CELL - 4, y + 4, x + CELL - 4, y + 7); }
    if (!bottom && !left) { ctx.moveTo(x + 4, y + CELL - 7); ctx.quadraticCurveTo(x + 4, y + CELL - 4, x + 7, y + CELL - 4); }
    if (!bottom && !right) { ctx.moveTo(x + CELL - 7, y + CELL - 4); ctx.quadraticCurveTo(x + CELL - 4, y + CELL - 4, x + CELL - 4, y + CELL - 7); }
    ctx.stroke();
  }
  ctx.fillStyle = '#e2d9ae';
  for (const cell of game.pellets) {
    ctx.beginPath();
    ctx.arc((cell % game.width + .5) * CELL, (Math.floor(cell / game.width) + .5) * CELL, 2.1, 0, Math.PI * 2);
    ctx.fill();
  }
  for (const cell of game.powerPellets) {
    const x = (cell % game.width + .5) * CELL;
    const y = (Math.floor(cell / game.width) + .5) * CELL;
    ctx.fillStyle = '#eed484';
    ctx.beginPath();
    ctx.arc(x, y, 5.2, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = '#eed48455';
    ctx.beginPath();
    ctx.arc(x, y, 8, 0, Math.PI * 2);
    ctx.stroke();
  }
  ctx.strokeStyle = '#c6afa5';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(9 * CELL + 4, 9 * CELL - 2);
  ctx.lineTo(10 * CELL - 4, 9 * CELL - 2);
  ctx.stroke();

  function position(from: number, to: number): [number, number] {
    let fx = from % game.width;
    const tx = to % game.width;
    const fy = Math.floor(from / game.width);
    const ty = Math.floor(to / game.width);
    if (Math.abs(fx - tx) > game.width - 2 && fy === ty) fx += fx > tx ? -game.width : game.width;
    if (Math.abs(fx - tx) + Math.abs(fy - ty) > 1) return [(tx + .5) * CELL, (ty + .5) * CELL];
    return [(fx + (tx - fx) * progress + .5) * CELL, (fy + (ty - fy) * progress + .5) * CELL];
  }

  const [px, py] = position(fromPlayer, game.player);
  const moving = game.status === 'playing' && fromPlayer !== game.player;
  const mouth = moving ? .15 + Math.abs(Math.sin(time / 90)) * .55 : .32;
  for (const offset of [-width, 0, width]) {
    ctx.save();
    ctx.translate(px + offset, py);
    ctx.rotate(angles[game.direction]);
    ctx.globalAlpha = game.invulnerableTicks > 0 && game.status === 'playing' && game.ticks % 2 === 0 ? .55 : 1;
    ctx.fillStyle = '#f1cf67';
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.arc(0, 0, 9.2, mouth, Math.PI * 2 - mouth);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = '#574c2c';
    ctx.beginPath();
    ctx.arc(1, -5, 1.4, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }
  game.ghosts.forEach((ghost, index) => {
    const [x, y] = position(fromGhosts[index] ?? ghost.cell, ghost.cell);
    const frightened = game.powerTicks > 0;
    const flashing = game.powerTicks < 12 && game.ticks % 4 < 2;
    for (const offset of [-width, 0, width]) {
      ctx.save();
      ctx.translate(x + offset, y);
      ctx.globalAlpha = ghost.cooldown > 0 ? .45 : 1;
      ctx.fillStyle = frightened ? (flashing ? '#f4eddc' : '#8dadd0') : GHOST_COLORS[index];
      ctx.beginPath();
      ctx.arc(0, -1, 9, Math.PI, 0);
      ctx.lineTo(9, 9);
      ctx.lineTo(5, 6);
      ctx.lineTo(1, 9);
      ctx.lineTo(-3, 6);
      ctx.lineTo(-7, 9);
      ctx.lineTo(-9, 7);
      ctx.closePath();
      ctx.fill();
      if (frightened) {
        ctx.fillStyle = '#334a62';
        ctx.fillRect(-4, -3, 2, 2);
        ctx.fillRect(3, -3, 2, 2);
        ctx.strokeStyle = '#334a62';
        ctx.lineWidth = 1.2;
        ctx.beginPath();
        ctx.moveTo(-5, 4); ctx.lineTo(-2, 2); ctx.lineTo(1, 4); ctx.lineTo(4, 2); ctx.lineTo(6, 4);
        ctx.stroke();
      } else {
        for (const eye of [-3.8, 3.8]) {
          ctx.fillStyle = '#fffdf2';
          ctx.beginPath();
          ctx.ellipse(eye, -2, 3, 3.7, 0, 0, Math.PI * 2);
          ctx.fill();
          ctx.fillStyle = '#3a4b4a';
          ctx.beginPath();
          ctx.arc(eye + Math.cos(angles[ghost.direction]) * 1.2, -2 + Math.sin(angles[ghost.direction]) * 1.2, 1.6, 0, Math.PI * 2);
          ctx.fill();
        }
      }
      ctx.restore();
    }
  });
}
