import { BALL_RADIUS, HEIGHT, PADDLE_HEIGHT, PADDLE_WIDTH, PADDLE_Y, WIDTH } from './engine';
import type { BreakoutGame } from './engine';

const colors = ['#d69c90', '#d9b180', '#d6c68b', '#aebe92', '#86b3a1', '#91acb7', '#b0a1bb'];

export function drawGame(ctx: CanvasRenderingContext2D, game: Pick<BreakoutGame, 'bricks' | 'ball' | 'paddleX' | 'level'>, trail: { x: number; y: number }[]): void {
  ctx.fillStyle = '#263e35';
  ctx.fillRect(0, 0, WIDTH, HEIGHT);
  ctx.fillStyle = '#365044';
  for (let x = 12; x < WIDTH; x += 24) {
    for (let y = 14; y < HEIGHT; y += 24) ctx.fillRect(x, y, 1.2, 1.2);
  }
  ctx.textAlign = 'center';
  ctx.font = '9px Consolas, monospace';
  ctx.fillStyle = '#869b80';
  ctx.fillText(`—  LITTLE BREAK / LEVEL 0${game.level}  —`, WIDTH / 2, 30);
  for (const brick of game.bricks) {
    if (brick.hp <= 0) continue;
    ctx.fillStyle = '#172e27';
    ctx.beginPath();
    ctx.roundRect(brick.x, brick.y + 3, brick.width, brick.height, 4);
    ctx.fill();
    ctx.fillStyle = colors[brick.row % colors.length];
    ctx.beginPath();
    ctx.roundRect(brick.x, brick.y, brick.width, brick.height, 4);
    ctx.fill();
    ctx.strokeStyle = '#fff9df55';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(brick.x + 5, brick.y + 3);
    ctx.lineTo(brick.x + brick.width - 5, brick.y + 3);
    ctx.stroke();
    if (brick.hp > 1) {
      ctx.strokeStyle = '#34463766';
      ctx.beginPath();
      ctx.roundRect(brick.x + 4, brick.y + 5, brick.width - 8, brick.height - 9, 2);
      ctx.stroke();
    } else if (brick.maxHp > 1) {
      ctx.strokeStyle = '#34463788';
      ctx.beginPath();
      ctx.moveTo(brick.x + brick.width / 2 - 3, brick.y);
      ctx.lineTo(brick.x + brick.width / 2 + 2, brick.y + brick.height / 2);
      ctx.lineTo(brick.x + brick.width / 2 - 2, brick.y + brick.height);
      ctx.stroke();
    }
  }
  ctx.fillStyle = '#526a53';
  ctx.font = '9px Consolas, monospace';
  ctx.fillText('KEEP THE GOOD THINGS BOUNCING', WIDTH / 2, HEIGHT - 103);
  ctx.strokeStyle = '#80916d44';
  ctx.setLineDash([3, 6]);
  ctx.beginPath();
  ctx.moveTo(16, HEIGHT - 12);
  ctx.lineTo(WIDTH - 16, HEIGHT - 12);
  ctx.stroke();
  ctx.setLineDash([]);
  ctx.fillStyle = '#142e27';
  ctx.beginPath();
  ctx.roundRect(game.paddleX - PADDLE_WIDTH / 2, PADDLE_Y + 4, PADDLE_WIDTH, PADDLE_HEIGHT, 6);
  ctx.fill();
  ctx.fillStyle = '#d8deaf';
  ctx.beginPath();
  ctx.roundRect(game.paddleX - PADDLE_WIDTH / 2, PADDLE_Y, PADDLE_WIDTH, PADDLE_HEIGHT, 6);
  ctx.fill();
  ctx.fillStyle = '#f6f4d2';
  ctx.fillRect(game.paddleX - 13, PADDLE_Y + 3, 26, 2);
  trail.forEach((point, index) => {
    ctx.fillStyle = `rgba(239, 219, 160, ${(index + 1) / trail.length * .22})`;
    ctx.beginPath();
    ctx.arc(point.x, point.y, BALL_RADIUS * (index + 1) / trail.length, 0, Math.PI * 2);
    ctx.fill();
  });
  ctx.fillStyle = '#f6dfaa';
  ctx.beginPath();
  ctx.arc(game.ball.x, game.ball.y, BALL_RADIUS, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#fff8da';
  ctx.beginPath();
  ctx.arc(game.ball.x - 2, game.ball.y - 2, 2, 0, Math.PI * 2);
  ctx.fill();
}
