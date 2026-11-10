// The rain and the filled part of the bar share one blue.
export const ACCENT = '#0a62d6';
const BLOCKS = '▏▎▍▌▋▊▉';
const ENDINGS = { done: 'are done', stopped: 'stopped', interrupted: 'interrupted' };

export function bar(level, width) {
  const units = Math.round(Math.max(0, Math.min(1, level)) * width * 8);
  const full = Math.floor(units / 8);
  const remainder = units % 8;
  const fill = '█'.repeat(full) + (remainder ? BLOCKS[remainder - 1] : '');
  return { fill, empty: '░'.repeat(width - full - (remainder ? 1 : 0)) };
}

// The one-line indicator from a Session's values, in three runs so the
// filled part of the bar can be drawn in its own color.
export function statusLine({ status, state, prepareLeft, config }) {
  return { before: '⛆ raindrops ', fill: '', ...describe(status, state, prepareLeft, config) };
}

function describe(status, state, prepareLeft, config) {
  if (status === 'ready') return { after: 'ready · /raindrops start' };
  if (status === 'prepare') return { after: `start in ${prepareLeft}` };
  if (status === 'running') {
    const { fill, empty } = bar(state.fill, 8);
    const round = String(state.round).padStart(String(config.rounds).length);
    return { fill, after: `${empty} ${round}/${config.rounds} ${state.phase.label.padEnd(6)} ${state.secLeft}s` };
  }
  return { after: `${ENDINGS[status] ?? 'interrupted'} · breathe normally` };
}

export function drawLine($, e, { before, fill, after }) {
  const { Box, Text } = $.ui.resolve(e);
  return Box({
    key: 'raindrops-line', flexDirection: 'row', height: 1,
    children: [
      Text({ wrap: 'truncate', children: [before] }),
      ...(fill ? [Text({ color: ACCENT, wrap: 'truncate', children: [fill] })] : []),
      Text({ wrap: 'truncate', children: [after] }),
    ],
  });
}
