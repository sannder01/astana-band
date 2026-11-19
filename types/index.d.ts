export type Weather = { temp: number; wind: number; code: number; at: number }
export type Limit = { kind: string; percentUsed: number; resetsAt?: string }

declare module 'claude-code' {
  interface PluginState {
    'astana-band': { weather: Weather | null; limits: Limit[]; isHidden: boolean; frame: number }
  }
}
