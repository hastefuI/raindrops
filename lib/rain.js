import { level } from './breathing.js';
import { ACCENT } from './status.js';

// ASCII only. Seeded drops keep their paths stable between native redraws.
const MAX_COLUMNS = 72;
const MAX_ROWS = 4;
const ease = value => (1 - Math.cos(Math.PI * value)) / 2;
const noise = seed => {
  let value = Math.imul(seed ^ 0x9e3779b9, 0x85ebca6b);
  value ^= value >>> 16;
  return (value >>> 0) / 4294967296;
};

// `state` needs only { phaseIndex, progress, round }.
export function rainFrame(state, columns, rows = MAX_ROWS) {
  const width = Math.max(1, Math.min(MAX_COLUMNS, Math.floor(columns)));
  const height = Math.max(1, Math.min(MAX_ROWS, Math.floor(rows)));
  const p = state.progress;
  const phase = state.phaseIndex;
  const density = level(phase, ease(p));
  const motion = [6 * p, 6 + 0.8 * (1 - Math.exp(-4 * p)), 6 + 0.8 * (1 - Math.exp(-4)) + 6 * p, 0][phase];
  const count = Math.max(1, Math.floor(width / 6));
  const grid = Array.from({ length: height }, () => Array(width).fill(' '));
  for (let drop = 0; drop < count; drop++) {
    const seed = drop + state.round * 31;
    const primary = drop === 0;
    // Keep one falling drop on screen until exhale actually ends.
    if (noise(seed + 991) >= density && !(primary && phase === 2)) continue;
    const x = Math.min(width - 1, Math.floor((drop + 0.2 + noise(seed + 17) * 0.6) * width / count));
    const period = primary ? height : height + 2;
    const position = (motion + noise(seed) * period) % period - (primary ? 0 : 1);
    const y = Math.floor(position);
    if (y < 0 || y >= height) continue;
    const fraction = position - y;
    grid[y][x] = fraction < 0.3 ? "'" : '|';
    if (y > 0 && fraction > 0.5) grid[y - 1][x] = "'";
    if (y === height - 1 && fraction > 0.7) {
      grid[y][x] = '.';
      if (x > 0) grid[y][x - 1] = '.';
      if (x < width - 1) grid[y][x + 1] = '.';
    }
  }
  return grid.map(row => row.join(''));
}

export function drawRain($, e, state, rows) {
  const lines = rainFrame(state, e.props.bodyColumns, rows);
  const { Box, Text } = $.ui.resolve(e);
  return Box({
    key: 'raindrops-rain', flexDirection: 'column', height: lines.length,
    children: lines.map(line => Text({ color: ACCENT, wrap: 'truncate', children: [line] })),
  });
}
