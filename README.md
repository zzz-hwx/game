# 摸鱼俱乐部

轻量网页小游戏合集，无需下载，打开即玩。
（AI生成）

## 游戏列表

| 游戏 | 分类 | 操作方式 |
|------|------|----------|
| 贪吃蛇 | 反应挑战 | 方向键 / WASD |
| 俄罗斯方块 | 经典益智 | 方向键 / 空格 |
| 连连看 | 轻松配对 | 鼠标 / 触屏 |
| 扫雷 | 逻辑推理 | 鼠标 / 触屏 |
| 2048 | 数字益智 | 方向键 / 滑动 |
| 推箱子 | 逻辑益智 | 方向键 / 触屏 |
| 吃豆人 | 经典街机 | 方向键 / 触屏 |
| 五子棋 | 经典棋局 | 鼠标 / 触屏 / 方向键 |
| 打砖块 | 经典街机 | 鼠标 / 方向键 / 触屏 |
| 翻牌配对 | 记忆配对 | 鼠标 / 触屏 / 方向键 |
| Flappy Bird | 反应挑战 | 空格 / 点击 / 触屏 |

## 技术栈

- **Vue 3** + **Vue Router** — 组件化与路由
- **Vite** — 构建与开发服务器
- **TypeScript** — 类型安全
- **Canvas** — 游戏渲染
- **Playwright** — 端到端测试

## 快速开始

```bash
npm install
npm run dev
```

浏览器访问 `http://127.0.0.1:5173` 即可。

## 可用脚本

| 命令 | 说明 |
|------|------|
| `npm run dev` | 启动开发服务器 |
| `npm run build` | 类型检查并构建生产版本 |
| `npm run preview` | 预览构建产物 |
| `npm run typecheck` | TypeScript 类型检查 |
| `npm test` | 运行测试 |
| `npm run test:browser` | 运行 Playwright 端到端测试 |

## 项目结构

```
src/
├── main.ts              # 入口
├── App.vue              # 根组件
├── router/index.ts      # 路由配置
├── views/               # 页面视图
├── components/          # 公共组件
├── data/                # 数据层（本地 / 云端）
└── games/               # 各游戏实现
    ├── registry.ts      # 游戏注册表
    ├── snake/
    ├── tetris/
    ├── link/
    ├── minesweeper/
    ├── 2048/
    ├── sokoban/
    ├── pacman/
    ├── gomoku/
    ├── breakout/
    ├── memory/
    └── flappy-bird/
```

## 许可证

MIT
