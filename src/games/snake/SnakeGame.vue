<script setup lang="ts">
import SvgIcon from '../../components/SvgIcon.vue';
import { computed, nextTick, onBeforeUnmount, onMounted, reactive, ref } from 'vue'
import {
  CELL, COLS, ROWS, FOOD_EDGE_UNLOCK_SCORE, FOOD_LIFETIME_MS, INITIAL_LIVES, advanceTime, createGame,
  directions, foodTypes, getMoveDelay, levels, parsePreferences, queueTurn,
  resumeGame as resumeState, startGame as resetAndStart, tick,
} from './engine'
import type { Collision, Direction, FoodKind, GameStatus, Level, PlayMode, Point, TickResult } from './engine'

const STORAGE_KEY = 'little-break-snake'
const TOUCH_REPEAT_WINDOW_MS = 80
const game = reactive(createGame('classic'))
const best = ref(0)
const level = ref<Level>('normal')
const mode = ref<PlayMode>('classic')
const soundEnabled = ref(false)
const announcement = ref('')
const popping = ref(false)
const scorePopKey = ref(0)
const scoreGain = ref(0)
const root = ref<HTMLDivElement | null>(null)
const board = ref<HTMLDivElement | null>(null)
const canvas = ref<HTMLCanvasElement | null>(null)
const startButton = ref<HTMLButtonElement | null>(null)
const pauseButton = ref<HTMLButtonElement | null>(null)
const levelDialog = ref<HTMLDialogElement | null>(null)
const pendingLevel = ref<Level | null>(null)
const pendingMode = ref<PlayMode | null>(null)
const pendingLevelLabel = computed(() => difficultyOptions.find(option => option.level === pendingLevel.value)?.label)
const pendingModeLabel = computed(() => modeOptions.find(option => option.mode === pendingMode.value)?.label)
const dialogTitle = computed(() => {
  if (pendingMode.value && pendingMode.value !== mode.value) return `切换到「${pendingModeLabel.value}」？`
  if (pendingLevel.value && pendingLevel.value !== level.value) return `切换为「${pendingLevelLabel.value}」难度？`
  return '重新开始？'
})
const dialogConfirmLabel = computed(() => {
  if (pendingMode.value && pendingMode.value !== mode.value) return '切换玩法'
  if (pendingLevel.value && pendingLevel.value !== level.value) return '切换难度'
  return '确认并重开'
})
const active = computed(() => ['running', 'paused', 'recovering'].includes(game.status))
const canResume = computed(() => game.status === 'paused' || game.status === 'recovering')
const currentFood = computed(() => game.food ? foodTypes[game.food.kind] : null)
const foodSeconds = computed(() => Math.ceil((game.food?.remainingMs ?? 0) / 1000))
const effectLabel = computed(() => game.effect
  ? `${game.effect.kind === 'speed' ? '加速中' : '减速中'} · ${Math.ceil(game.effect.remainingMs / 1000)} 秒`
  : '正常速度')
const soundLabel = computed(() => soundEnabled.value ? '关闭音效' : '开启音效')
const speedCaption = computed(() => game.status === 'ready' ? levels[level.value].caption : '随时可换难度，确认后按新难度重开')
const collisionLabels: Record<Collision, string> = { wall: '撞到墙壁', body: '咬到自己', obstacle: '撞到石块' }
const statusLabels: Record<GameStatus, string> = {
  ready: '准备就绪', running: '快乐进行中', paused: '休息一下', recovering: '等待续玩', over: '本局结束', won: '完美通关',
}
const modeOptions: { mode: PlayMode; label: string; description: string }[] = [
  { mode: 'classic', label: '经典模式', description: '普通食物，一条命，撞墙即结束' },
  { mode: 'fun', label: '趣味模式', description: '五种果实，三条命，石块障碍' },
]
const difficultyOptions: { level: Level; icon: string; label: string }[] = [
  { level: 'easy', icon: 'Ⅰ', label: '悠闲' },
  { level: 'normal', icon: 'Ⅱ', label: '标准' },
  { level: 'hard', icon: 'Ⅲ', label: '挑战' },
]
const mobileDirections: { direction: Direction; label: string; icon: string }[] = [
  { direction: 'left', label: '向左', icon: 'icon-dir-left' },
  { direction: 'down', label: '向下', icon: 'icon-dir-down' },
  { direction: 'right', label: '向右', icon: 'icon-dir-right' },
]
const fruitIcons: Record<string, string> = {
  apple: 'fruit-apple',
  golden: 'fruit-golden',
  speed: 'fruit-speed',
  slow: 'fruit-slow',
  shrink: 'fruit-shrink',
}
const overlay = computed(() => {
  if (game.status === 'recovering') return {
    title: '还有机会，继续出发！',
    description: `${game.collision ? collisionLabels[game.collision] : '失去一条生命'} · 剩余 ${game.lives} 条命 · 保留 ${game.score} 分`,
    button: '继续游戏', eyebrow: 'TAKE A BREATH, TRY AGAIN', hint: '已回到安全起点，按空格键继续',
  }
  if (game.status === 'paused') return {
    title: '歇一会儿，没关系。', description: '食物与效果倒计时已暂停，准备好再继续。', button: '继续游戏',
    eyebrow: 'NO RUSH, TAKE YOUR TIME', hint: '按空格键继续',
  }
  if (game.status === 'over' || game.status === 'won') return {
    title: game.status === 'won' ? '一口一口，吃成冠军！' : '休息一下，再来一局？',
    description: `本局得分 ${game.score} · 小蛇长度 ${game.snake.length} 格`, button: '再玩一次',
    eyebrow: game.status === 'won' ? 'YOU ATE THE WHOLE WORLD' : 'A LITTLE BREAK, A FRESH START',
    hint: '按空格键，快乐重新开始',
  }
  if (mode.value === 'classic') {
    return {
      title: '准备好，开吃！', description: '经典玩法：普通食物，一条命，撞墙或咬到自己就结束。', button: '开始游戏',
      eyebrow: "LET'S TAKE A LITTLE BREAK", hint: '也可以按空格键开始',
    }
  }
  return {
    title: '准备好，开吃！', description: '三条命，五种果实。绕开石块，抓紧开吃。', button: '开始游戏',
    eyebrow: "LET'S TAKE A LITTLE BREAK", hint: '也可以按空格键开始',
  }
})

let mounted = false
let timer: ReturnType<typeof setTimeout> | undefined
let lastTickTime = 0
let moveRemainingMs = 0
let resumeAfterLevelChange = false
let observer: ResizeObserver | undefined
let context: CanvasRenderingContext2D | null = null
let audioContext: AudioContext | undefined
let touchStart: { x: number; y: number; pointerId: number } | null = null
const touchDirectionTimes = new Map<Direction, number>()
const tones = new Set<{ oscillator: OscillatorNode; gain: GainNode }>()

function formatScore(value: number): string {
  return String(value).padStart(2, '0')
}

function savePreferences(): void {
  try {
    const saved = parsePreferences(localStorage.getItem(STORAGE_KEY))
    saved.best[mode.value][level.value] = Math.max(saved.best[mode.value][level.value], best.value)
    best.value = saved.best[mode.value][level.value]
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ best: saved.best, level: level.value, mode: mode.value, sound: soundEnabled.value }))
  } catch { /* Storage may be disabled. The game still works for this session. */ }
}

function onStorage(event: StorageEvent): void {
  if (event.key !== STORAGE_KEY) return
  try {
    if (event.storageArea === localStorage) {
      const saved = parsePreferences(localStorage.getItem(STORAGE_KEY))
      best.value = Math.max(best.value, saved.best[mode.value][level.value])
    }
  } catch { /* Local storage can be unavailable. */ }
}

function clearTimer(): void {
  if (timer !== undefined) clearTimeout(timer)
  timer = undefined
}

function focusBoard(): void {
  void nextTick(() => {
    if (mounted && game.status === 'running') board.value?.focus({ preventScroll: true })
  })
}

function announceOverlay(focus: boolean): void {
  announcement.value = `${overlay.value.title} ${overlay.value.description}`
  if (focus) void nextTick(() => {
    if (mounted && game.status !== 'running') startButton.value?.focus({ preventScroll: true })
  })
}

function scheduleTick(): void {
  clearTimer()
  if (!mounted || game.status !== 'running') return
  const delay = Math.min(moveRemainingMs, game.food?.remainingMs ?? Infinity, game.effect?.remainingMs ?? Infinity)
  timer = setTimeout(runTick, Math.max(1, Math.ceil(delay)))
}

function updateClock(): GameStatus {
  const now = performance.now()
  const elapsed = now - lastTickTime
  lastTickTime = now
  const previousDelay = getMoveDelay(game, level.value)
  advanceTime(game, elapsed)
  moveRemainingMs -= elapsed
  // Preserve progress within a move when a timed speed effect expires.
  moveRemainingMs *= getMoveDelay(game, level.value) / previousDelay
  return game.status
}

function startGame(): void {
  clearTimer()
  game.mode = mode.value
  resetAndStart(game)
  touchDirectionTimes.clear()
  popping.value = false
  moveRemainingMs = getMoveDelay(game, level.value)
  lastTickTime = performance.now()
  draw()
  playTone('start')
  scheduleTick()
  announcement.value = mode.value === 'classic'
    ? '经典模式开始。方向键或 WASD 控制移动，空格键暂停。'
    : '趣味模式开始，共三条生命。方向键或 WASD 控制移动，空格键暂停。'
  focusBoard()
}

function runTick(): void {
  timer = undefined
  if (game.status !== 'running') return
  const status = updateClock()
  const previousScore = game.score
  const eatenKind = game.food?.kind
  let result: TickResult = status === 'won' ? 'won' : 'idle'
  if (status === 'running' && moveRemainingMs <= 0) {
    result = tick(game)
    moveRemainingMs = getMoveDelay(game, level.value)
  }
  if (game.score > previousScore) {
    scoreGain.value = game.score - previousScore
    if (game.score > best.value) {
      best.value = game.score
      savePreferences()
    }
    scorePopKey.value++
    popping.value = true
    playTone('eat')
    announcement.value = `${eatenKind ? foodTypes[eatenKind].label : '果实'}，加 ${scoreGain.value} 分。${effectLabel.value}。`
  }
  draw()
  if (result === 'over' || result === 'won' || result === 'life-lost') {
    clearTimer()
    if (result !== 'won') playTone('over')
    if (result === 'life-lost') touchDirectionTimes.clear()
    announceOverlay(document.activeElement === board.value || document.activeElement === pauseButton.value)
  } else scheduleTick()
}

function pauseGame(focus = true): void {
  if (game.status !== 'running') return
  clearTimer()
  updateClock()
  if (game.status === 'running') game.status = 'paused'
  draw()
  announceOverlay(focus)
}

function resumeGame(): void {
  if (!canResume.value) return
  resumeState(game)
  lastTickTime = performance.now()
  touchDirectionTimes.clear()
  scheduleTick()
  announcement.value = `游戏继续，剩余 ${game.lives} 条生命。`
  focusBoard()
}

function togglePause(): void {
  if (game.status === 'running') pauseGame()
  else if (canResume.value) resumeGame()
  else startGame()
}

function activateStart(): void {
  if (canResume.value) resumeGame()
  else startGame()
}

function changeDirection(name: Direction, touch = false): void {
  if (game.status === 'ready') startGame()
  const now = performance.now()
  if (touch && now - (touchDirectionTimes.get(name) ?? -Infinity) < TOUCH_REPEAT_WINDOW_MS) return
  if (queueTurn(game, name) && touch) touchDirectionTimes.set(name, now)
}

function requestRestart(nextLevel: Level = level.value, nextMode: PlayMode = mode.value): void {
  const levelChanged = nextLevel !== level.value
  const modeChanged = nextMode !== mode.value
  if ((!levelChanged && !modeChanged) || pendingLevel.value || pendingMode.value) return
  if (game.status === 'ready') {
    if (levelChanged) level.value = nextLevel
    if (modeChanged) mode.value = nextMode
    savePreferences()
    return
  }
  resumeAfterLevelChange = game.status === 'running'
  pauseGame(false)
  clearTouch()
  pendingLevel.value = levelChanged ? nextLevel : null
  pendingMode.value = modeChanged ? nextMode : null
  void nextTick(() => {
    if (!mounted || (!pendingLevel.value && !pendingMode.value) || !levelDialog.value) return
    levelDialog.value.returnValue = ''
    levelDialog.value.showModal()
  })
}

function onLevelDialogClosed(): void {
  const next = pendingLevel.value
  const nextMode = pendingMode.value
  const shouldResume = resumeAfterLevelChange
  pendingLevel.value = null
  pendingMode.value = null
  resumeAfterLevelChange = false
  if (!mounted || (!next && !nextMode)) return
  if (levelDialog.value?.returnValue === 'confirm') {
    if (next) level.value = next
    if (nextMode) mode.value = nextMode
    savePreferences()
    clearTimer()
    game.mode = mode.value
    resetAndStart(game)
    game.status = 'ready'
    touchDirectionTimes.clear()
    popping.value = false
    draw()
    announceOverlay(true)
  } else if (shouldResume && !document.hidden) resumeGame()
  if (game.status === 'running') board.value?.scrollIntoView({ block: 'center' })
}

function toggleSound(): void {
  soundEnabled.value = !soundEnabled.value
  savePreferences()
  if (soundEnabled.value) playTone('start')
}

function playTone(type: 'eat' | 'start' | 'over'): void {
  if (!soundEnabled.value || !mounted) return
  try {
    const AudioConstructor = window.AudioContext
      ?? (window as Window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
    if (!AudioConstructor) return
    audioContext ??= new AudioConstructor()
    if (audioContext.state === 'suspended') void audioContext.resume().catch(() => {})
    const oscillator = audioContext.createOscillator()
    const gain = audioContext.createGain()
    const tone = { oscillator, gain }
    tones.add(tone)
    const frequencies = { eat: [660, 990], start: [440, 660], over: [220, 110] } as const
    const now = audioContext.currentTime
    oscillator.type = 'sine'
    oscillator.frequency.setValueAtTime(frequencies[type][0], now)
    oscillator.frequency.exponentialRampToValueAtTime(frequencies[type][1], now + 0.12)
    gain.gain.setValueAtTime(0.065, now)
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.17)
    oscillator.connect(gain)
    gain.connect(audioContext.destination)
    oscillator.onended = () => {
      oscillator.disconnect()
      gain.disconnect()
      tones.delete(tone)
    }
    oscillator.start(now)
    oscillator.stop(now + 0.18)
  } catch { /* Audio is optional, including on browsers that block it. */ }
}

function roundedRect(ctx: CanvasRenderingContext2D, x: number, y: number, width: number, height: number, radius: number, color: string): void {
  ctx.fillStyle = color
  ctx.beginPath()
  ctx.roundRect(x, y, width, height, radius)
  ctx.fill()
}

function drawFood(ctx: CanvasRenderingContext2D, position: Point, kind: FoodKind = 'apple', remainingMs = FOOD_LIFETIME_MS): void {
  const x = position.x * CELL
  const y = position.y * CELL
  const cx = x + CELL / 2
  const cy = y + CELL / 2
  const style = foodTypes[kind]
  ctx.strokeStyle = remainingMs <= 3000 ? '#a44e39' : `${style.color}70`
  ctx.lineWidth = 1.5
  ctx.beginPath()
  ctx.arc(cx, cy, 11.5, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * remainingMs / FOOD_LIFETIME_MS)
  ctx.stroke()
  if (kind === 'apple') {
    ctx.fillStyle = style.color
    ctx.beginPath()
    ctx.arc(cx, cy + 1, 8, 0, Math.PI * 2)
    ctx.fill()
    ctx.strokeStyle = '#6c8b4c'
    ctx.lineWidth = 2
    ctx.beginPath()
    ctx.moveTo(cx, cy - 6)
    ctx.lineTo(cx, cy - 10)
    ctx.stroke()
    ctx.beginPath()
    ctx.moveTo(cx + 1, cy - 8)
    ctx.quadraticCurveTo(cx + 4, cy - 12, cx + 7, cy - 9)
    ctx.stroke()
    return
  }
  if (kind === 'golden') {
    ctx.fillStyle = style.color
    ctx.beginPath()
    ctx.moveTo(cx, cy - 9)
    ctx.lineTo(cx + 3, cy - 3)
    ctx.lineTo(cx + 9, cy)
    ctx.lineTo(cx + 3, cy + 3)
    ctx.lineTo(cx, cy + 9)
    ctx.lineTo(cx - 3, cy + 3)
    ctx.lineTo(cx - 9, cy)
    ctx.lineTo(cx - 3, cy - 3)
    ctx.closePath()
    ctx.fill()
    ctx.fillStyle = '#fffdf480'
    ctx.beginPath()
    ctx.arc(cx, cy, 2, 0, Math.PI * 2)
    ctx.fill()
    return
  }
  if (kind === 'speed') {
    ctx.fillStyle = style.color
    ctx.beginPath()
    ctx.moveTo(cx + 2, cy - 9)
    ctx.lineTo(cx - 6, cy + 1)
    ctx.lineTo(cx - 1, cy + 1)
    ctx.lineTo(cx - 3, cy + 9)
    ctx.lineTo(cx + 6, cy - 1)
    ctx.lineTo(cx + 1, cy - 1)
    ctx.closePath()
    ctx.fill()
    return
  }
  if (kind === 'slow') {
    ctx.fillStyle = style.color
    ctx.beginPath()
    ctx.arc(cx, cy, 3.5, 0, Math.PI * 2)
    ctx.fill()
    ctx.strokeStyle = style.color
    ctx.lineWidth = 1.8
    ctx.lineCap = 'round'
    for (let i = 0; i < 6; i++) {
      const angle = i * Math.PI / 3
      ctx.beginPath()
      ctx.moveTo(cx + Math.cos(angle) * 4.5, cy + Math.sin(angle) * 4.5)
      ctx.lineTo(cx + Math.cos(angle) * 9, cy + Math.sin(angle) * 9)
      ctx.stroke()
    }
    return
  }
  ctx.fillStyle = style.color
  ctx.beginPath()
  ctx.arc(cx, cy, 9, 0, Math.PI * 2)
  ctx.fill()
  ctx.strokeStyle = '#fffdf4'
  ctx.lineWidth = 2.5
  ctx.lineCap = 'round'
  ctx.beginPath()
  ctx.moveTo(cx - 5, cy)
  ctx.lineTo(cx + 5, cy)
  ctx.stroke()
}

function drawSnake(ctx: CanvasRenderingContext2D, parts: readonly Point[], facing: Readonly<Point>): void {
  for (let i = parts.length - 1; i >= 0; i--) {
    const part = parts[i]
    if (!part) continue
    const color = i === 0 ? '#305e3c' : '#66894b'
    roundedRect(ctx, part.x * CELL + 2, part.y * CELL + 2, CELL - 4, CELL - 4, 6, color)
    const previous = parts[i - 1]
    if (previous) {
      const x = Math.min(part.x, previous.x) * CELL + CELL / 2 - 7
      const y = Math.min(part.y, previous.y) * CELL + CELL / 2 - 7
      roundedRect(ctx, x, y, Math.abs(part.x - previous.x) * CELL + 14, Math.abs(part.y - previous.y) * CELL + 14, 3, color)
    }
  }
  const head = parts[0]
  if (!head) return
  const centerX = head.x * CELL + CELL / 2
  const centerY = head.y * CELL + CELL / 2
  for (const side of [-1, 1]) {
    const eyeX = centerX + facing.x * 4 + facing.y * side * 5
    const eyeY = centerY + facing.y * 4 + facing.x * side * 5
    ctx.fillStyle = '#f1f4dc'
    ctx.beginPath()
    ctx.arc(eyeX, eyeY, 3, 0, Math.PI * 2)
    ctx.fill()
    ctx.fillStyle = '#233e2a'
    ctx.beginPath()
    ctx.arc(eyeX + facing.x, eyeY + facing.y, 1.5, 0, Math.PI * 2)
    ctx.fill()
  }
}

function draw(): void {
  const ctx = context
  if (!ctx) return
  const width = COLS * CELL
  const height = ROWS * CELL
  ctx.clearRect(0, 0, width, height)
  ctx.fillStyle = '#eaf0d8'
  ctx.fillRect(0, 0, width, height)
  ctx.strokeStyle = '#dce5c980'
  ctx.lineWidth = 0.65
  ctx.beginPath()
  for (let x = 0; x <= COLS; x++) { ctx.moveTo(x * CELL, 0); ctx.lineTo(x * CELL, height) }
  for (let y = 0; y <= ROWS; y++) { ctx.moveTo(0, y * CELL); ctx.lineTo(width, y * CELL) }
  ctx.stroke()
  for (const stone of game.obstacles) {
    roundedRect(ctx, stone.x * CELL + 2, stone.y * CELL + 2, CELL - 4, CELL - 4, 4, '#6f796b')
    roundedRect(ctx, stone.x * CELL + 5, stone.y * CELL + 5, CELL - 10, 4, 2, '#a6ae98')
  }
  if (game.status === 'ready') {
    ctx.globalAlpha = 0.2
    const decorations = [
      [{ x: 3, y: 4 }, { x: 3, y: 5 }, { x: 3, y: 6 }, { x: 4, y: 6 }, { x: 5, y: 6 }],
      [{ x: 21, y: 17 }, { x: 22, y: 17 }, { x: 23, y: 17 }, { x: 23, y: 16 }, { x: 23, y: 15 }],
    ]
    for (const parts of decorations) drawSnake(ctx, parts, directions.right)
    drawFood(ctx, { x: 22, y: 4 })
    drawFood(ctx, { x: 6, y: 17 })
    ctx.globalAlpha = 1
    return
  }
  if (game.food) drawFood(ctx, game.food, game.food.kind, game.food.remainingMs)
  drawSnake(ctx, game.snake, directions[game.direction])
}

function resizeCanvas(): void {
  if (!board.value || !canvas.value || !context) return
  const ratio = Math.min(window.devicePixelRatio || 1, 2)
  const bounds = board.value.getBoundingClientRect()
  canvas.value.width = Math.max(1, Math.round(bounds.width * ratio))
  canvas.value.height = Math.max(1, Math.round(bounds.height * ratio))
  context.setTransform(canvas.value.width / (COLS * CELL), 0, 0, canvas.value.height / (ROWS * CELL), 0, 0)
  draw()
}

const keyDirections: Readonly<Record<string, Direction>> = {
  ArrowUp: 'up', ArrowDown: 'down', ArrowLeft: 'left', ArrowRight: 'right',
  w: 'up', s: 'down', a: 'left', d: 'right',
}

function onKeyDown(event: KeyboardEvent): void {
  if (pendingLevel.value || event.defaultPrevented) return
  const target = event.target instanceof Element ? event.target : null
  if (event.ctrlKey || event.metaKey || event.altKey || event.isComposing
    || target?.closest('input, textarea, select, [contenteditable]:not([contenteditable="false"]), [role="textbox"]')) return
  const interactive = target?.closest('button, a, [role="button"], [role="link"], [role="switch"], [role="checkbox"], [role="slider"], [tabindex]')
  // Do not hijack the shell's navigation or Space on settings/sound/restart controls.
  if (interactive && !root.value?.contains(interactive)) return
  const name = keyDirections[event.key] ?? keyDirections[event.key.toLowerCase()]
  if (name) {
    event.preventDefault()
    if (!event.repeat) changeDirection(name)
  } else if (event.code === 'Space' || event.key === ' ') {
    if (interactive && interactive !== board.value && interactive !== startButton.value && interactive !== pauseButton.value) return
    event.preventDefault()
    if (!event.repeat) togglePause()
  } else if (event.key === 'Escape') {
    pauseGame()
  }
}

function onDirectionPointer(event: PointerEvent, direction: Direction): void {
  if (!event.isPrimary || event.button !== 0) return
  event.preventDefault()
  changeDirection(direction, event.pointerType === 'touch')
  if (game.status === 'running') focusBoard()
}

function onDirectionClick(event: MouseEvent, direction: Direction): void {
  if (event.detail === 0) {
    changeDirection(direction)
    if (game.status === 'running') focusBoard()
  }
}

function onBoardPointerDown(event: PointerEvent): void {
  if (!event.isPrimary || event.button !== 0 || (event.target instanceof Element && event.target.closest('button'))) return
  touchStart = { x: event.clientX, y: event.clientY, pointerId: event.pointerId }
  board.value?.setPointerCapture(event.pointerId)
  board.value?.focus({ preventScroll: true })
}

function clearTouch(): void {
  const pointerId = touchStart?.pointerId
  touchStart = null
  if (pointerId !== undefined && board.value?.hasPointerCapture(pointerId)) board.value.releasePointerCapture(pointerId)
}

function onBoardPointerUp(event: PointerEvent): void {
  if (!touchStart || touchStart.pointerId !== event.pointerId) return
  const dx = event.clientX - touchStart.x
  const dy = event.clientY - touchStart.y
  clearTouch()
  if (Math.max(Math.abs(dx), Math.abs(dy)) < 16) return
  changeDirection(Math.abs(dx) > Math.abs(dy) ? dx > 0 ? 'right' : 'left' : dy > 0 ? 'down' : 'up', event.pointerType === 'touch')
}

function onBlur(): void {
  resumeAfterLevelChange = false
  pauseGame(false)
}
function onVisibilityChange(): void { if (document.hidden) onBlur() }

onMounted(() => {
  mounted = true
  try {
    const saved = parsePreferences(localStorage.getItem(STORAGE_KEY))
    level.value = saved.level
    mode.value = saved.mode
    best.value = saved.best[mode.value][level.value]
    soundEnabled.value = saved.sound
  } catch { /* Local storage can be unavailable. */ }
  context = canvas.value?.getContext('2d') ?? null
  if (typeof ResizeObserver !== 'undefined' && board.value) {
    observer = new ResizeObserver(resizeCanvas)
    observer.observe(board.value)
  }
  resizeCanvas()
  document.addEventListener('keydown', onKeyDown)
  document.addEventListener('visibilitychange', onVisibilityChange)
  window.addEventListener('blur', onBlur)
  window.addEventListener('resize', resizeCanvas)
  window.addEventListener('storage', onStorage)
})

onBeforeUnmount(() => {
  mounted = false
  levelDialog.value?.close()
  clearTimer()
  clearTouch()
  observer?.disconnect()
  document.removeEventListener('keydown', onKeyDown)
  document.removeEventListener('visibilitychange', onVisibilityChange)
  window.removeEventListener('blur', onBlur)
  window.removeEventListener('resize', resizeCanvas)
  window.removeEventListener('storage', onStorage)
  for (const { oscillator, gain } of tones) {
    oscillator.onended = null
    try { oscillator.stop() } catch { /* It may already have stopped. */ }
    oscillator.disconnect()
    gain.disconnect()
  }
  tones.clear()
  if (audioContext && audioContext.state !== 'closed') void audioContext.close().catch(() => {})
  audioContext = undefined
  context = null
})
</script>

<template>
  <div ref="root" class="snake-game">

    <main>
      <section class="intro" aria-labelledby="page-title">
        <div>
          <div class="eyebrow"><span class="tiny-line"></span> 小游戏，大快乐 <span class="eyebrow-separator">/</span> THE CLASSICS</div>
          <h1 id="page-title">贪吃蛇<span class="title-dot">.</span><span class="title-tag">经典回归</span></h1>
          <p class="intro-description">放下待办，吃掉烦恼。给自己一个刚刚好的小休息。</p>
        </div>
        <div class="intro-note"><SvgIcon class="icon" aria-hidden="true" name="icon-leaf" /><span>不赶时间<br><strong>快乐就好。</strong></span></div>
      </section>

      <div class="game-layout">
        <section class="game-card" aria-label="贪吃蛇游戏">
          <div class="scoreboard">
            <div class="score-main"><span class="score-label">当前得分</span><span id="score" class="score-value">{{ formatScore(game.score) }}</span></div>
            <div class="score-best"><SvgIcon class="icon" aria-hidden="true" name="icon-cup" /><div><span class="score-label">最高纪录</span><span id="best-score" class="best-value">{{ formatScore(best) }}</span></div></div>
            <div id="game-status" class="game-status" :data-state="game.status"><span></span><span id="status-text">{{ statusLabels[game.status] }}</span></div>
          </div>
          <div class="run-info" role="group" aria-label="本局状态">
            <div v-if="mode === 'fun'" id="lives" class="lives" :aria-label="`剩余 ${game.lives} 条生命`">
              <span>生命</span><span class="life-dots" aria-hidden="true"><i v-for="life in INITIAL_LIVES" :key="life" :class="{ lost: life > game.lives }"></i></span><strong>{{ game.lives }}/{{ INITIAL_LIVES }}</strong>
            </div>
            <span id="snake-length">长度 {{ game.snake.length }}</span>
            <span v-if="mode === 'fun'" id="effect-status" :data-effect="game.effect?.kind ?? 'none'">{{ effectLabel }}</span>
          </div>
          <div class="food-status" :class="{ urgent: mode === 'fun' && foodSeconds <= 3 && game.food }">
            <template v-if="currentFood && game.food">
              <SvgIcon class="food-symbol" :style="{ color: currentFood.color }" aria-hidden="true" :name="fruitIcons[game.food.kind]" />
              <span id="current-food">{{ currentFood.label }} <strong>+{{ currentFood.points }}</strong></span>
              <span v-if="mode === 'fun'" id="food-timer">{{ foodSeconds }} 秒后刷新</span>
              <progress v-if="mode === 'fun'" :value="game.food.remainingMs" :max="FOOD_LIFETIME_MS" aria-label="食物剩余时间"></progress>
            </template>
            <span v-else>所有空格都吃完啦</span>
          </div>
          <div class="board-frame">
            <div id="board" ref="board" class="board" tabindex="0" role="group" aria-label="贪吃蛇棋盘" aria-describedby="game-controls-help"
              @pointerdown="onBoardPointerDown" @pointerup="onBoardPointerUp" @pointercancel="clearTouch" @lostpointercapture="clearTouch">
              <canvas id="game-canvas" ref="canvas" width="700" height="550" role="img" aria-label="贪吃蛇游戏区域。使用方向键或 WASD 移动，空格键暂停。">使用方向键或 WASD 移动，空格键暂停。</canvas>
              <div class="board-corner corner-tl"></div><div class="board-corner corner-tr"></div><div class="board-corner corner-bl"></div><div class="board-corner corner-br"></div>
              <div id="overlay" class="overlay" :hidden="game.status === 'running'">
                <div class="overlay-content">
                  <span id="overlay-eyebrow" class="overlay-eyebrow">{{ overlay.eyebrow }}</span>
                  <div class="snake-mascot" aria-hidden="true"><SvgIcon viewBox="0 0 112 76" sprite="illustrations" name="snake-mascot" /></div>
                  <h2 id="overlay-title">{{ overlay.title }}</h2>
                  <p id="overlay-description">{{ overlay.description }}</p>
                  <button id="start-button" ref="startButton" type="button" class="primary-button" @click="activateStart"><SvgIcon class="icon" aria-hidden="true" name="icon-play" /><span id="start-label">{{ overlay.button }}</span><span class="button-key" aria-hidden="true">SPACE</span></button>
                  <span id="overlay-hint" class="overlay-hint">{{ overlay.hint }}</span>
                </div>
              </div>
              <div id="count-pop" :key="scorePopKey" class="count-pop" :class="{ pop: popping }" aria-hidden="true" @animationend="popping = false">+{{ scoreGain }}</div>
            </div>
          </div>
          <div class="game-toolbar">
            <div class="toolbar-hint"><SvgIcon class="icon" aria-hidden="true" name="icon-keyboard" /><span>方向键移动 <span class="hint-divider">·</span> 空格键暂停</span></div>
            <div class="toolbar-actions">
              <button id="pause-button" ref="pauseButton" type="button" class="tool-button" :aria-label="canResume ? '继续游戏' : '暂停游戏'" title="暂停 / 继续（空格键）" :disabled="!active" @click="togglePause"><SvgIcon class="icon" aria-hidden="true" :name="canResume ? 'icon-play' : 'icon-pause'" /></button>
              <button id="restart-button" type="button" class="tool-button" aria-label="重新开始" title="重新开始" @click="startGame"><SvgIcon class="icon" aria-hidden="true" name="icon-restart" /></button>
              <span class="toolbar-divider"></span>
              <button id="sound-button" type="button" class="tool-button" :aria-label="soundLabel" :title="soundLabel" :aria-pressed="soundEnabled" @click="toggleSound"><SvgIcon class="icon" aria-hidden="true" :name="soundEnabled ? 'icon-sound' : 'icon-mute'" /></button>
            </div>
          </div>
        </section>

        <div class="mobile-controls" role="group" aria-label="触屏方向控制">
          <button type="button" data-direction="up" aria-label="向上" @pointerdown="onDirectionPointer($event, 'up')" @click="onDirectionClick($event, 'up')"><SvgIcon class="dir-icon" aria-hidden="true" name="icon-dir-up" /></button>
          <div><button v-for="control in mobileDirections" :key="control.direction" type="button" :data-direction="control.direction" :aria-label="control.label" @pointerdown="onDirectionPointer($event, control.direction)" @click="onDirectionClick($event, control.direction)"><SvgIcon class="dir-icon" aria-hidden="true" :name="control.icon" /></button></div>
          <p>也可以在棋盘上滑动控制方向</p>
        </div>

        <aside class="sidebar">
          <section class="settings-card">
            <div class="section-heading"><h2>选择玩法</h2><span>00</span></div>
            <p class="section-description">{{ mode === 'classic' ? '纯粹体验，经典回归。' : '五种果实，三种障碍，更多乐趣。' }}</p>
            <div class="mode-options" role="group" aria-label="游戏玩法">
              <button v-for="option in modeOptions" :key="option.mode" type="button" class="mode-button" :class="{ active: mode === option.mode }" :data-mode="option.mode" :aria-pressed="mode === option.mode" :disabled="!!(pendingMode || pendingLevel)" @click="requestRestart(level, option.mode)"><span>{{ option.label }}</span><span class="mode-desc">{{ option.description }}</span></button>
            </div>
            <div class="card-divider"></div>
            <div class="section-heading"><h2>你的游戏，你的节奏</h2><span>01</span></div>
            <p class="section-description">选一个舒服的速度，出发吧。</p>
            <div class="difficulty-options" role="group" aria-label="游戏难度">
              <button v-for="option in difficultyOptions" :key="option.level" type="button" class="difficulty-button" :class="{ active: level === option.level }" :data-level="option.level" :aria-pressed="level === option.level" :disabled="!!(pendingMode || pendingLevel)" @click="requestRestart(option.level, mode)"><span class="level-icon">{{ option.icon }}</span><span>{{ option.label }}</span></button>
            </div>
            <div class="speed-caption"><span class="small-dot"></span><span id="speed-caption">{{ speedCaption }}</span></div>
            <div class="card-divider"></div>
            <div class="section-heading"><h2>简单三步，快乐加倍</h2><SvgIcon class="icon muted" aria-hidden="true" name="icon-arrow" /></div>
            <ol id="game-controls-help" class="instructions">
              <li><span class="step-number">1</span><div><strong>控制方向</strong><p>方向键或 WASD，带小蛇去探索。</p></div></li>
              <template v-if="mode === 'fun'">
                <li><span class="step-number">2</span><div><strong>认准果实，及时开吃</strong><p>果实 {{ FOOD_LIFETIME_MS / 1000 }} 秒后消失并刷新，暂停时停止计时。</p><p>未满 {{ FOOD_EDGE_UNLOCK_SCORE }} 分只在中央刷新，达到后墙边、角落也会出现；中央放满时提前开放全图。</p></div></li>
                <li><span class="step-number">3</span><div><strong>绕开石块，珍惜生命</strong><p>每局 {{ INITIAL_LIVES }} 条命，撞墙、撞灰色石块或自己都会扣 1 条。归零才结束；续玩保留分数，蛇回到起点，清除变速效果。</p></div></li>
              </template>
              <template v-else>
                <li><span class="step-number">2</span><div><strong>吃掉红果，不断成长</strong><p>普通食物不过期，吃一个长一格。</p></div></li>
                <li><span class="step-number">3</span><div><strong>小心墙壁，珍惜生命</strong><p>一条命，撞墙或咬到自己就结束。</p></div></li>
              </template>
            </ol>
            <template v-if="mode === 'fun'">
              <div class="card-divider"></div>
              <div class="section-heading"><h2>果实图鉴</h2><span>05</span></div>
              <ul class="food-guide" aria-label="食物种类与效果">
                <li v-for="(food, kind) in foodTypes" :key="kind" :data-food="kind">
                  <SvgIcon class="food-symbol" :style="{ color: food.color }" aria-hidden="true" :name="fruitIcons[kind as string]" />
                  <div><strong>{{ food.label }} <span>+{{ food.points }}</span></strong><p>{{ food.description }}</p></div>
                </li>
              </ul>
              <p class="effect-help">加速与减速不叠加，以最后吃到的为准，持续 6 秒。</p>
            </template>
            <div class="keyboard-guide" aria-hidden="true"><div class="key-row"><kbd>↑</kbd></div><div class="key-row"><kbd>←</kbd><kbd>↓</kbd><kbd>→</kbd></div><span>或 W / A / S / D</span></div>
          </section>
          <section class="break-card">
            <div class="break-top"><span>BREAK TIME, BEST TIME.</span><SvgIcon class="icon" aria-hidden="true" name="icon-leaf" /></div>
            <h2>生活偶尔打个结，<br>小蛇只管向前。</h2>
            <p>今天也要，记得给快乐留一点空间。</p>
            <SvgIcon class="decorative-snake" viewBox="0 0 300 92" aria-hidden="true" sprite="illustrations" name="decorative-snake" />
          </section>
        </aside>
      </div>

      <footer><span><span class="footer-dot"></span> 纯粹的游戏，简单的快乐。</span><span>MADE FOR YOUR LITTLE BREAK <span class="footer-star">＋</span></span></footer>
    </main>
    <dialog id="level-dialog" ref="levelDialog" class="level-dialog" aria-labelledby="level-dialog-title" aria-describedby="level-dialog-description" @close="onLevelDialogClosed" @cancel.prevent="levelDialog?.close()">
      <h2 id="level-dialog-title">{{ dialogTitle }}</h2>
      <p id="level-dialog-description">确认后会按新设置重新开局，当前得分、蛇身、生命和食物效果将重置，最高纪录保留。</p>
      <div class="level-dialog-actions">
        <button id="level-cancel" type="button" class="secondary-button" autofocus @click="levelDialog?.close()">取消切换</button>
        <button id="level-confirm" type="button" class="primary-button" @click="levelDialog?.close('confirm')">{{ dialogConfirmLabel }}</button>
      </div>
    </dialog>
    <div id="announcement" class="sr-only" role="status" aria-live="polite">{{ announcement }}</div>
  </div>
</template>

<style scoped src="./styles.css"></style>
