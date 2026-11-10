/** The breath state the rain is drawn from. */
export type Rain = { phaseIndex: number; progress: number; round: number };

/** The indicator in three runs; `fill` is drawn in the accent blue. */
export type Line = { before: string; fill: string; after: string };

/** What the band above the prompt draws while the indicator shows. */
export type Band = { line: Line; rain: Rain | null };

declare module 'claude-code' {
  interface PluginState {
    raindrops: { band: Shaped<Band | null> };
  }
}
