import { expect, mock, test } from 'claude-code/testing';

// Stands in for the engine beneath the mod and counts the mod's state writes,
// one per timer tick, so a cancelled timer shows as no new writes.
function host(on, registrations: any[] = []) {
  const counts = { writes: 0 };
  on('state.set', ($, e, next) => { counts.writes += 1; return next(e); });
  on('ui.status', () => ({ value: undefined }));
  on('command.register', ($, e) => { registrations.push(e); return { value: { command: e.name } }; });
  on('session.start', () => ({ cwd: '/work' }));
  on('session.end', ($, e) => ({ sessionId: e.sessionId }));
  on('ui.render', () => ({ type: 'Text', props: {}, children: ['Other mod'] }));
  return counts;
}

const START = { surface: 'terminal', isInteractive: true, cwd: '/work' } as const;
const END = { reason: 'clear', sessionId: 'test-session', resume: {} } as const;
const BAND = {
  plugin: 'raindrops', component: 'AbovePrompt', requestId: 'above-prompt', surface: 'terminal',
  viewport: { columns: 80, rows: 24 },
  props: { hasSurvey: false, isCollapsed: false, isWorking: false, maxRows: 6, bodyColumns: 60,
    scroll: { offset: 0, bodyRows: 6 }, view: {} },
} as const;

const line = async ui => (await ui.find({ key: 'raindrops-line' }))?.text;
const rain = ui => ui.find({ key: 'raindrops-rain' });

test('the default command starts and completes the routine', async ($, on) => {
  host(on);
  const clock = mock.clock(on);
  const ui = await $.ui.mount(BAND);
  expect(await line(ui)).toBeUndefined();
  await $.command.run({ command: 'raindrops', args: '' });
  expect(await line(ui)).toBe('⛆ raindrops start in 3');
  await clock.advance(3000);
  expect(await line(ui)).toMatch(/ 1\/4 inhale 4s$/);
  await clock.advance(4000);
  expect(await line(ui)).toMatch(/ 1\/4 hold   4s$/);
  await clock.advance(60000);
  expect(await line(ui)).toBe('⛆ raindrops are done · breathe normally');
  await ui.unmount();
});

test('the filled part of the bar is drawn in the accent blue', async ($, on) => {
  host(on);
  const clock = mock.clock(on);
  const ui = await $.ui.mount(BAND);
  await $.command.run({ command: 'raindrops', args: '' });
  await clock.advance(5000);
  expect(await line(ui)).toMatch(/^⛆ raindrops █{4}░{4} /);
  expect((await ui.find({ type: 'Text', text: '████' })).props.color).toBe('#0a62d6');
  expect((await ui.find({ type: 'Text', text: '⛆ raindrops ' })).props.color).toBeUndefined();
  expect((await ui.find({ type: 'Text', text: /^░{4} 1\/4 inhale/ })).props.color).toBeUndefined();
  await ui.unmount();
});

test('the indicator moves between whole seconds', async ($, on) => {
  host(on);
  const clock = mock.clock(on);
  const ui = await $.ui.mount(BAND);
  await $.command.run({ command: 'raindrops', args: '' });
  await clock.advance(3000);
  const before = await line(ui);
  await clock.advance(100);
  expect(await line(ui)).not.toBe(before);
  await ui.unmount();
});

test('stop, restart, and exit cancel old timers and clear the indicator', async ($, on) => {
  const counts = host(on);
  const clock = mock.clock(on);
  const ui = await $.ui.mount(BAND);
  await $.command.run({ command: 'raindrops', args: '' });
  await $.command.run({ command: 'raindrops', args: 'start' });
  await clock.advance(19000);
  await $.command.run({ command: 'raindrops', args: 'stop' });
  expect(await line(ui)).toBe('⛆ raindrops stopped · breathe normally');
  const stopped = counts.writes;
  await clock.advance(50000);
  expect(counts.writes).toBe(stopped);
  await $.command.run({ command: 'raindrops', args: 'start' });
  await clock.advance(3000);
  expect(await line(ui)).toMatch(/ 1\/4 inhale 4s$/);
  await $.command.run({ command: 'raindrops', args: 'exit' });
  expect(await line(ui)).toBeUndefined();
  const closed = counts.writes;
  await clock.advance(10000);
  expect(counts.writes).toBe(closed);
  await ui.unmount();
});

test('invalid arguments preserve the active exercise and session end hides it', async ($, on) => {
  const counts = host(on);
  const clock = mock.clock(on);
  const ui = await $.ui.mount(BAND);
  await $.command.run({ command: 'raindrops', args: 'start' });
  for (const args of ['quick', 'quick 3', 'train', 'train 5', '6', 'start 3', 'close']) {
    const result = await $.command.run({ command: 'raindrops', args });
    expect(result.text).toContain('Use /raindrops start');
  }
  expect(await line(ui)).toBe('⛆ raindrops start in 3');
  await clock.advance(3000);
  expect(await line(ui)).toMatch(/inhale/);
  await $.session.end(END);
  expect(await line(ui)).toBeUndefined();
  const ended = counts.writes;
  await clock.advance(5000);
  expect(counts.writes).toBe(ended);
  await ui.unmount();
});

test('startup registers the native command and shows no indicator', async ($, on) => {
  const registrations: any[] = [];
  host(on, registrations);
  const ui = await $.ui.mount(BAND);
  await $.session.start(START);
  expect(registrations[0]).toMatchObject({ name: 'raindrops', immediate: true, argumentHint: '[start|stop|exit]' });
  expect(await line(ui)).toBeUndefined();
  await ui.unmount();
});

test('a new exercise runs after a clear ends the last one', async ($, on) => {
  host(on);
  const clock = mock.clock(on);
  const ui = await $.ui.mount(BAND);
  await $.command.run({ command: 'raindrops', args: 'start' });
  await $.session.end(END);
  expect(await line(ui)).toBeUndefined();
  await $.command.run({ command: 'raindrops', args: '' });
  expect(await line(ui)).toBe('⛆ raindrops start in 3');
  await clock.advance(3000);
  expect(await line(ui)).toMatch(/inhale/);
  await ui.unmount();
});

test('the temporary rain animates only during an exercise and preserves other mods', async ($, on) => {
  host(on);
  const clock = mock.clock(on);
  const ui = await $.ui.mount(BAND);
  expect(await rain(ui)).toBeUndefined();
  await $.command.run({ command: 'raindrops', args: 'start' });
  expect(await rain(ui)).toBeDefined();
  expect(await ui.find({ type: 'Text', text: 'Other mod' })).toBeDefined();
  await clock.advance(4800);
  const before = await rain(ui);
  await clock.advance(500);
  expect(await rain(ui)).not.toEqual(before);
  await $.command.run({ command: 'raindrops', args: 'stop' });
  expect(await rain(ui)).toBeUndefined();
  expect(await line(ui)).toMatch(/stopped/);
  expect(await ui.find({ type: 'Text', text: 'Other mod' })).toBeDefined();
  await $.command.run({ command: 'raindrops', args: 'start' });
  await clock.advance(67000);
  expect(await rain(ui)).toBeUndefined();
  expect(await line(ui)).toMatch(/are done/);
  await ui.unmount();
});

test('the rain leaves a row for the indicator and yields to small bands', async ($, on) => {
  host(on);
  mock.clock(on);
  const ui = await $.ui.mount(BAND);
  await $.command.run({ command: 'raindrops', args: 'start' });
  expect((await rain(ui)).props.height).toBe(4);
  await ui.redraw({ ...BAND.props, maxRows: 4 });
  expect((await rain(ui)).props.height).toBe(3);
  await ui.redraw({ ...BAND.props, maxRows: 2 });
  expect(await rain(ui)).toBeUndefined();
  expect(await line(ui)).toBe('⛆ raindrops start in 3');
  await ui.unmount();
});

test('the band yields to host surveys and disappears on exit and session end', async ($, on) => {
  host(on);
  mock.clock(on);
  await $.command.run({ command: 'raindrops', args: 'start' });
  const ui = await $.ui.mount(BAND);
  await ui.redraw({ ...BAND.props, hasSurvey: true });
  expect(await rain(ui)).toBeUndefined();
  expect(await line(ui)).toBeUndefined();
  await ui.redraw(BAND.props);
  expect(await rain(ui)).toBeDefined();
  await $.command.run({ command: 'raindrops', args: 'exit' });
  expect(await rain(ui)).toBeUndefined();
  await $.command.run({ command: 'raindrops', args: 'start' });
  await $.session.end(END);
  expect(await rain(ui)).toBeUndefined();
  expect(await line(ui)).toBeUndefined();
  await ui.unmount();
});

test('native rain remains visible through the last exhale tick and clears at rest', async ($, on) => {
  host(on);
  const clock = mock.clock(on);
  await $.command.run({ command: 'raindrops', args: 'start' });
  const ui = await $.ui.mount(BAND);
  await clock.advance(14900);
  expect((await rain(ui)).text.trim().length).toBeGreaterThan(0);
  await clock.advance(100);
  expect((await rain(ui)).text.trim()).toBe('');
  await ui.unmount();
});

test('invoking the default command again restarts with one timer', async ($, on) => {
  const counts = host(on);
  const clock = mock.clock(on);
  const ui = await $.ui.mount(BAND);
  await $.command.run({ command: 'raindrops', args: '' });
  await clock.advance(19000);
  expect(await line(ui)).toMatch(/ 2\/4 /);
  await $.command.run({ command: 'raindrops', args: '   ' });
  expect(await line(ui)).toBe('⛆ raindrops start in 3');
  await clock.advance(3000);
  expect(await line(ui)).toMatch(/ 1\/4 inhale 4s$/);
  // One timer writes about ten times a second, two would write twenty.
  const before = counts.writes;
  await clock.advance(1000);
  expect(counts.writes - before).toBeLessThanOrEqual(11);
  await $.command.run({ command: 'raindrops', args: 'exit' });
  const closed = counts.writes;
  await clock.advance(10000);
  expect(counts.writes).toBe(closed);
  await ui.unmount();
});

test('session start, which a reload runs again, clears the band', async ($, on) => {
  // $.state outlives a reload, but the earlier copy's timer does not.
  host(on);
  mock.clock(on);
  await $.command.run({ command: 'raindrops', args: 'start' });
  const ui = await $.ui.mount(BAND);
  expect(await rain(ui)).toBeDefined();
  await $.session.start(START);
  expect(await rain(ui)).toBeUndefined();
  expect(await line(ui)).toBeUndefined();
  await ui.unmount();
});
