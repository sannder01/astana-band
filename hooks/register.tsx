import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register } from 'claude-code'

import type { Limit, Weather } from '../types'
import { TREE_PIX } from './tree-pix'

const weather = atom({ plugin: 'astana-band', key: 'weather' } as const, null)
const limits = atom({ plugin: 'astana-band', key: 'limits' } as const, [])
const isHidden = atom({ plugin: 'astana-band', key: 'isHidden' } as const, false)
const frame = atom({ plugin: 'astana-band', key: 'frame' } as const, 0)

// Open-Meteo: free, no key. Astana 51.17N 71.43E
const URL =
  'https://api.open-meteo.com/v1/forecast?latitude=51.1694&longitude=71.4491&current=temperature_2m,weather_code,wind_speed_10m&wind_speed_unit=ms&timezone=Asia%2FAlmaty'

function sky(code: number): { icon: string; word: string } {
  if (code === 0) return { icon: '*', word: 'ЯСНО' }
  if (code <= 2) return { icon: '~', word: 'ОБЛАЧНО' }
  if (code === 3) return { icon: '=', word: 'ПАСМУРНО' }
  if (code <= 48) return { icon: '≈', word: 'ТУМАН' }
  if (code <= 67 || (code >= 80 && code <= 82)) return { icon: '/', word: 'ДОЖДЬ' }
  if (code <= 77 || code === 85 || code === 86) return { icon: '+', word: 'СНЕГ' }
  return { icon: '!', word: 'ГРОЗА' }
}

const CELLS = 16
const FILL_FRAMES = 10 // how many frames the bar takes to fill on start

function bar(pct: number): [number, number] {
  const full = Math.max(0, Math.min(CELLS, Math.round((pct / 100) * CELLS)))
  return [full, CELLS - full]
}

// Pseudo-random but stable per column, so each flake keeps its own lane.
function hash(n: number): number {
  let x = (n * 2654435761) >>> 0
  x ^= x >>> 13
  x = (x * 1274126177) >>> 0
  return (x ^ (x >>> 16)) >>> 0
}

// One row of falling snow: the flake in column c sits at row (frame - h) mod 5,
// so every frame each flake moves one row down.
function snow(row: number, width: number, f: number, seed: number): string {
  let out = ''
  for (let c = 0; c < width; c++) {
    const h = hash(c + seed * 997)
    const isLane = h % 3 !== 0
    const isFlake = isLane && (((row - f + (h % 5)) % 5) + 5) % 5 === 0
    out += isFlake ? (h % 2 === 0 ? '*' : '·') : ' '
  }
  return out
}

// The tree: pixel art from the user's picture, two pixel rows per text row.
const TREE_W = 5
const ROWS = 4
const MID_W = 13
const LEFT_W = 36
const RIGHT_W = 24
const SPIN = ['|', '/', '-', '\\']

function resetIn(iso: string | undefined, now: number): string {
  if (!iso) return ''
  const ms = Date.parse(iso) - now
  if (!(ms > 0)) return ''
  const h = Math.floor(ms / 3600000)
  const m = Math.floor((ms % 3600000) / 60000)
  return h >= 24 ? ` ${Math.floor(h / 24)}д${h % 24}ч` : h > 0 ? ` ${h}ч${m}м` : ` ${m}м`
}

const NAMES: Record<string, string> = { five_hour: '5Ч', seven_day: '7Д', spend_limit: '$$' }
const ORDER: Record<string, number> = { five_hour: 0, seven_day: 1 }

async function fetchWeather($: EngineInterface): Promise<void> {
  try {
    const r = await $.http.fetch(URL)
    if (!r.ok) return
    const j = JSON.parse(r.text) as {
      current?: { temperature_2m: number; weather_code: number; wind_speed_10m: number }
    }
    if (!j.current) return
    const w: Weather = {
      temp: Math.round(j.current.temperature_2m),
      wind: Math.round(j.current.wind_speed_10m),
      code: j.current.weather_code,
      at: await $.clock.now(),
    }
    await update($, weather, () => w)
  } catch {
    // offline: keep the last reading
  }
}

async function refreshLimits($: EngineInterface): Promise<void> {
  const u = await $.session.usage()
  const next: Limit[] = u.rateLimits.map(l => ({ kind: l.kind, percentUsed: l.percentUsed, resetsAt: l.resetsAt }))
  await update($, limits, () => next)
}

export const register: Register = on => {
  let weatherTimer: { cancel: () => void } | null = null
  let animTimer: { cancel: () => void } | null = null
  let startFrame = 0

  on('session.start', async ($, e, next) => {
    const result = await next(e)
    void fetchWeather($)
    void refreshLimits($)
    weatherTimer?.cancel()
    weatherTimer = $.clock.every(15 * 60 * 1000, () => void fetchWeather($))
    startFrame = await read($, frame)
    animTimer?.cancel()
    animTimer = $.clock.every(600, () => {
      void (async () => {
        if (await read($, isHidden)) return
        await update($, frame, n => (n + 1) % 100000)
      })()
    })
    $.command.register({ name: 'astana-band', description: 'Показать/скрыть полоску с лимитами и погодой' })
    return result
  })

  on('session.measure', async ($, e, next) => {
    const fresh: Limit[] = e.rateLimits.map(l => ({ kind: l.kind, percentUsed: l.percentUsed, resetsAt: l.resetsAt }))
    await update($, limits, () => fresh)
    return next(e)
  })

  on('command.run', { command: 'astana-band' }, async ($, e, next) => {
    const hidden = await update($, isHidden, v => !v)
    return { text: hidden ? 'Полоска скрыта' : 'Полоска снова тут' }
  })

  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    if (e.props.hasSurvey || (await read($, isHidden))) return next(e)

    const { Box, Text } = $.ui.resolve(e)
    const w = await read($, weather)
    const ls = [...(await read($, limits))].sort((a, b) => (ORDER[a.kind] ?? 9) - (ORDER[b.kind] ?? 9))
    const now = await $.clock.now()
    const f = await read($, frame)
    const grow = Math.min(1, Math.max(0, (f - startFrame) / FILL_FRAMES))
    const isBlinkOff = f % 2 === 1

    const limitRow = (l: Limit | undefined, i: number) => {
      if (!l) {
        return (
          <Text key={`l${i}`} mono dimColor>
            {i === 0 ? 'ЛИМИТЫ: ЖДЁМ API...'.padEnd(LEFT_W) : snow(i + 1, LEFT_W, f, 8)}
          </Text>
        )
      }
      const [full0] = bar(l.percentUsed * grow)
      const isHot = l.percentUsed >= 85 && grow >= 1
      const full = isHot && isBlinkOff ? Math.max(0, full0 - 1) : full0
      const pct = Math.round(l.percentUsed * grow)
      return (
        <Text key={l.kind} mono>
          <Text bold>{(NAMES[l.kind] ?? l.kind).padEnd(3)}</Text>
          <Text>[</Text>
          <Text>{'█'.repeat(full)}</Text>
          <Text dimColor>{'█'.repeat(CELLS - full)}</Text>
          <Text>]</Text>
          <Text bold>{` ${String(pct).padStart(3)}%`}</Text>
          <Text dimColor>{resetIn(l.resetsAt, now)}</Text>
        </Text>
      )
    }

    // Middle column: the pixel tree in half blocks, snow in the empty cells.
    const pad = Math.floor((MID_W - TREE_W) / 2)
    const midRow = (r: number) => {
      const flakes = snow(r, MID_W, f, 2)
      const top = TREE_PIX[(r - 1) * 2] ?? []
      const bottom = TREE_PIX[(r - 1) * 2 + 1] ?? []
      const cells = []
      for (let c = 0; c < MID_W; c++) {
        const hi = top[c - pad] ?? ''
        const lo = bottom[c - pad] ?? ''
        const k = String(c)
        if (hi && lo) cells.push(<Text key={k} color={hi} backgroundColor={lo}>▀</Text>)
        else if (hi) cells.push(<Text key={k} color={hi}>▀</Text>)
        else if (lo) cells.push(<Text key={k} color={lo}>▄</Text>)
        else cells.push(<Text key={k} dimColor>{flakes[c] ?? ' '}</Text>)
      }
      return <Text key={`m${r}`} mono>{cells}</Text>
    }
    const middle = <Box flexDirection="column">{Array.from({ length: ROWS }, (_, r) => midRow(r))}</Box>

    const isSnowy = w !== null && ((w.code >= 71 && w.code <= 77) || w.code === 85 || w.code === 86)
    const icon = w === null ? '' : isSnowy ? (f % 2 === 0 ? '*' : '+') : sky(w.code).icon

    const rightRows = [
      <Text key="r0" mono dimColor>{snow(0, RIGHT_W, f, 3)}</Text>,
      w === null ? (
        <Text key="r1" mono dimColor>{'АСТАНА ...'.padStart(RIGHT_W)}</Text>
      ) : (
        <Text key="r1" mono bold>{`${icon} АСТАНА ${w.temp > 0 ? '+' : ''}${w.temp}°C`.padStart(RIGHT_W)}</Text>
      ),
      w === null ? (
        <Text key="r2" mono dimColor>{snow(2, RIGHT_W, f, 9)}</Text>
      ) : (
        <Text key="r2" mono dimColor>{`${sky(w.code).word} · ${SPIN[f % 4]} ${w.wind}М/С`.padStart(RIGHT_W)}</Text>
      ),
      <Text key="r3" mono dimColor>{snow(3, RIGHT_W, f, 4)}</Text>,
    ]

    const leftRows = [
      <Text key="s0" mono dimColor>{snow(0, LEFT_W, f, 1)}</Text>,
      limitRow(ls[0], 0),
      limitRow(ls[1], 1),
      <Text key="s3" mono dimColor>{snow(3, LEFT_W, f, 6)}</Text>,
    ]

    return (
      <Box flexDirection="row" justifyContent="space-between" borderStyle="single" paddingX={1}>
        <Box flexDirection="column">{leftRows}</Box>
        {middle}
        <Box flexDirection="column" alignItems="flex-end">{rightRows}</Box>
      </Box>
    )
  })
}
