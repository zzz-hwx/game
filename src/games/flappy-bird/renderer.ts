import { BIRD_X, GROUND_Y, HEIGHT, PIPE_GAP, PIPE_WIDTH, WIDTH } from './engine';
import type { FlappyBirdGame } from './engine';

function cloud(ctx: CanvasRenderingContext2D, x: number, y: number, scale: number): void {
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(scale, scale);
  ctx.fillStyle = '#f9fbef';
  ctx.beginPath();
  ctx.roundRect(0, 12, 76, 23, 12);
  ctx.fill();
  ctx.beginPath();
  ctx.arc(24, 13, 17, 0, Math.PI * 2);
  ctx.arc(46, 9, 22, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

function pipe(ctx: CanvasRenderingContext2D, x: number, y: number, height: number, upper: boolean): void {
  ctx.fillStyle = '#789971';
  ctx.fillRect(x + 4, y, PIPE_WIDTH - 8, height);
  ctx.fillStyle = '#a8c18b';
  ctx.fillRect(x + 7, y, 13, height);
  ctx.fillStyle = '#648462';
  ctx.fillRect(x + PIPE_WIDTH - 12, y, 5, height);
  const lipY = upper ? y + height - 23 : y;
  ctx.fillStyle = '#557951';
  ctx.beginPath();
  ctx.roundRect(x, lipY, PIPE_WIDTH, 23, 3);
  ctx.fill();
  ctx.fillStyle = '#a0bc85';
  ctx.fillRect(x + 3, lipY + 3, PIPE_WIDTH - 6, 15);
  ctx.fillStyle = '#cad9a8';
  ctx.fillRect(x + 5, lipY + 3, PIPE_WIDTH - 10, 3);
}

function bird(ctx: CanvasRenderingContext2D, y: number, angle: number, wing: number): void {
  ctx.save();
  ctx.translate(BIRD_X, y);
  ctx.rotate(angle);
  ctx.lineWidth = 2;
  ctx.strokeStyle = '#8a7846';
  ctx.fillStyle = '#efcb6f';
  ctx.beginPath();
  ctx.ellipse(0, 0, 17, 14, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();
  ctx.fillStyle = '#f7df95';
  ctx.beginPath();
  ctx.ellipse(-9, 3 + wing, 9, 6, -.25, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();
  ctx.fillStyle = '#fffdf1';
  ctx.beginPath();
  ctx.ellipse(8, -5, 7, 8, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#3b4e3e';
  ctx.beginPath();
  ctx.arc(11, -5, 2.5, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#dc9566';
  ctx.beginPath();
  ctx.roundRect(10, 3, 14, 6, 3);
  ctx.fill();
  ctx.stroke();
  ctx.restore();
}

export function drawGame(ctx: CanvasRenderingContext2D, game: Pick<FlappyBirdGame, 'status' | 'score' | 'elapsed' | 'distance' | 'bird' | 'pipes'>, idleTime = 0): void {
  const sky = ctx.createLinearGradient(0, 0, 0, GROUND_Y);
  sky.addColorStop(0, '#d4e8e2');
  sky.addColorStop(1, '#edf0d9');
  ctx.fillStyle = sky;
  ctx.fillRect(0, 0, WIDTH, HEIGHT);
  ctx.fillStyle = '#f9f3ce';
  ctx.beginPath();
  ctx.arc(333, 81, 29, 0, Math.PI * 2);
  ctx.fill();
  for (let i = 0; i < 4; i++) {
    const x = ((i * 156 + 32 - game.distance * .16) % 624 + 624) % 624 - 95;
    cloud(ctx, x, 95 + (i % 3) * 53, .7 + (i % 2) * .2);
  }
  ctx.fillStyle = '#c5d9b6';
  ctx.beginPath();
  ctx.moveTo(0, GROUND_Y);
  for (let x = 0; x <= WIDTH; x += 4) {
    ctx.lineTo(x, 417 + Math.sin((x + game.distance * .22) / 92) * 24);
  }
  ctx.lineTo(WIDTH, GROUND_Y);
  ctx.fill();
  ctx.fillStyle = '#adc49b';
  ctx.beginPath();
  ctx.moveTo(0, GROUND_Y);
  for (let x = 0; x <= WIDTH; x += 4) {
    ctx.lineTo(x, 462 + Math.sin((x + game.distance * .4) / 49) * 13);
  }
  ctx.lineTo(WIDTH, GROUND_Y);
  ctx.fill();
  for (const obstacle of game.pipes) {
    pipe(ctx, obstacle.x, 0, obstacle.gapY - PIPE_GAP / 2, true);
    const bottom = obstacle.gapY + PIPE_GAP / 2;
    pipe(ctx, obstacle.x, bottom, GROUND_Y - bottom, false);
  }
  const phase = game.status === 'ready' ? idleTime : game.elapsed;
  const y = game.bird.y + (game.status === 'ready' ? Math.sin(phase * 3) * 5 : 0);
  const angle = game.status === 'ready' ? -.12 : Math.max(-.4, Math.min(1.25, game.bird.vy / 550));
  bird(ctx, y, angle, Math.sin(phase * 24) * 2);
  ctx.fillStyle = '#769365';
  ctx.fillRect(0, GROUND_Y, WIDTH, 4);
  ctx.fillStyle = '#c5d395';
  ctx.fillRect(0, GROUND_Y + 4, WIDTH, 10);
  ctx.fillStyle = '#95ad75';
  for (let x = -(game.distance % 24); x < WIDTH; x += 24) {
    ctx.beginPath();
    ctx.moveTo(x, GROUND_Y + 4);
    ctx.lineTo(x + 10, GROUND_Y + 4);
    ctx.lineTo(x + 4, GROUND_Y + 14);
    ctx.lineTo(x - 6, GROUND_Y + 14);
    ctx.fill();
  }
  ctx.fillStyle = '#e9dfbc';
  ctx.fillRect(0, GROUND_Y + 14, WIDTH, HEIGHT - GROUND_Y - 14);
  ctx.fillStyle = '#c5b990';
  ctx.textAlign = 'center';
  ctx.font = '8px Consolas, monospace';
  ctx.fillText('ONE LITTLE FLAP AT A TIME', WIDTH / 2, HEIGHT - 14);
  if (game.status === 'playing') {
    ctx.font = 'bold 46px Consolas, monospace';
    ctx.strokeStyle = '#5e7d6480';
    ctx.lineWidth = 4;
    ctx.strokeText(String(game.score), WIDTH / 2, 70);
    ctx.fillStyle = '#fffdf1';
    ctx.fillText(String(game.score), WIDTH / 2, 70);
  }
}
