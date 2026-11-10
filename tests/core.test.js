import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseAction, ROUTINE, stateAt, Session } from '../lib/breathing.js';
import { bar, statusLine } from '../lib/status.js';

test('the routine is four complete 4-4-4-4 rounds', () => {
  assert.deepEqual(ROUTINE, { count: 4, rounds: 4, totalMs: 64000 });
  assert.equal(new Session().config, ROUTINE);
});

test('empty arguments start the routine and only explicit actions are accepted', () => {
  assert.equal(parseAction(), 'start');
  assert.equal(parseAction(''), 'start');
  assert.equal(parseAction('   '), 'start');
  for (const action of ['start', 'stop', 'exit']) {
    assert.equal(parseAction(action), action);
    assert.equal(parseAction(`  ${action}  `), action);
  }
  for (const args of ['quick', 'quick 3', 'train', 'train 5', '3', '4', '5', '6',
    'close', 'start 3', 'start extra', '$(id)', '4;ls', '--help']) {
    assert.throws(() => parseAction(args), /Use \/raindrops start/);
  }
});

test('phase boundaries, countdowns, round accounting, and fill follow equal sides', () => {
  const config = ROUTINE;
  const states = [0, 4000, 8000, 12000].map(ms => stateAt(ms, config));
  assert.deepEqual(states.map(s => s.phaseIndex), [0, 1, 2, 3]);
  assert.deepEqual(states.map(s => s.fill), [0, 1, 1, 0]);
  assert.deepEqual(states.map(s => s.secLeft), [4, 4, 4, 4]);
  assert.equal(stateAt(2000, config).fill, 0.5);
  assert.equal(stateAt(10000, config).fill, 0.5);
  assert.equal(stateAt(3999, config).secLeft, 1);
  assert.equal(stateAt(15999, config).roundsCompleted, 0);
  assert.equal(stateAt(16000, config).roundsCompleted, 1);
  assert.equal(stateAt(63999, config).done, false);
  assert.equal(stateAt(64000, config).roundsCompleted, 4);
  assert.equal(stateAt(64000, config).done, true);
});

test('preparation precedes inhale, ticks use actual time, and completion stops', () => {
  const session = new Session();
  session.start(100);
  for (let now = 200; now < 3100; now += 100) session.tick(now);
  assert.equal(session.status, 'prepare');
  session.tick(3100);
  assert.equal(session.status, 'running');
  session.tick(4225);
  assert.equal(session.state.elapsedMs, 1125);
  for (let now = 4325; now <= 67125; now += 100) session.tick(now);
  assert.equal(session.status, 'done');
  assert.equal(session.state.roundsCompleted, 4);
});

test('a stalled or reversed clock interrupts instead of replaying cues', () => {
  for (const now of [1601, -1, 100000]) {
    const session = new Session();
    session.start(0);
    session.tick(now);
    assert.equal(session.status, 'interrupted');
    assert.equal(session.state.roundsCompleted, 0);
    session.tick(200000);
    assert.equal(session.status, 'interrupted');
    session.start(200000);
    assert.equal(session.status, 'prepare');
  }
});

test('stop freezes progress and restart begins at the first inhale', () => {
  const session = new Session();
  session.start(0);
  for (let now = 100; now <= 20000; now += 100) session.tick(now);
  session.stop();
  assert.equal(session.status, 'stopped');
  assert.equal(session.state.roundsCompleted, 1);
  session.tick(50000);
  assert.equal(session.state.elapsedMs, 17000);
  session.start(50000);
  assert.equal(session.state.elapsedMs, 0);
});

test('the tiny fill bar preserves its width and tracks the breath level', () => {
  for (const width of [4, 10, 14]) {
    for (const level of [-1, 0, 0.1, 0.5, 0.9, 1, 2]) {
      const result = bar(level, width);
      assert.equal([...result.fill + result.empty].length, width);
    }
    assert.equal(bar(0, width).fill, '');
    assert.equal(bar(1, width).fill, '█'.repeat(width));
  }
  assert.deepEqual(bar(0.5, 14), { fill: '█'.repeat(7), empty: '░'.repeat(7) });
});

const at = (status, elapsedMs = 2000) => ({ status, prepareLeft: 3, config: ROUTINE, state: stateAt(elapsedMs, ROUTINE) });
const text = session => Object.values(statusLine(session)).join('');

test('the status line shows the phase and bar on one line', () => {
  assert.equal(text(at('running', 2000)), '⛆ raindrops ████░░░░ 1/4 inhale 2s');
  assert.equal(text(at('running', 4000)), '⛆ raindrops ████████ 1/4 hold   4s');
  assert.equal(text(at('prepare')), '⛆ raindrops start in 3');
});

test('only the filled part of the bar is its own run', () => {
  assert.deepEqual(statusLine(at('running', 2000)), { before: '⛆ raindrops ', fill: '████', after: '░░░░ 1/4 inhale 2s' });
  assert.equal(statusLine(at('stopped')).fill, '');
});

test('the countdown stays in a fixed column throughout the routine', () => {
  const positions = [];
  for (const round of [1, 2, 3, 4]) {
    for (let phase = 0; phase < 4; phase++) {
      positions.push(text(at('running', ((round - 1) * 4 + phase) * 4000 + 2000)).search(/2s$/));
    }
  }
  assert.equal(new Set(positions).size, 1);
  assert.ok(positions[0] > 0);
});

test('every status uses the raindrops name and endings ask for normal breathing', () => {
  for (const status of ['ready', 'prepare', 'running', 'done', 'stopped', 'interrupted']) {
    assert.ok(text(at(status)).startsWith('⛆ raindrops '), status);
  }
  assert.equal(text(at('done', ROUTINE.totalMs)), '⛆ raindrops are done · breathe normally');
  assert.equal(text(at('stopped')), '⛆ raindrops stopped · breathe normally');
  assert.equal(text(at('interrupted')), '⛆ raindrops interrupted · breathe normally');
});
