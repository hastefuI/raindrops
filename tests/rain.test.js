import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ROUTINE, stateAt } from '../lib/breathing.js';
import { rainFrame } from '../lib/rain.js';
const config = ROUTINE;
const ink = frame => frame.join('').replaceAll(' ', '').length;

test('rain stays inside its region and uses only ASCII drops', () => {
  for (const columns of [1, 8, 20, 80, 200]) {
    for (const rows of [1, 2, 4]) {
      for (const elapsed of [0, 1000, 3900, 4000, 7900, 8000, 11900, 12000, 15900]) {
        const frame = rainFrame(stateAt(elapsed, config), columns, rows);
        assert.equal(frame.length, rows);
        assert.ok(frame.every(row => row.length <= columns && /^[ '|.]*$/.test(row)));
      }
    }
  }
});

test('rain builds on inhale and clears for rest', () => {
  const start = rainFrame(stateAt(0, config), 72);
  const inhale = rainFrame(stateAt(3900, config), 72);
  assert.equal(ink(start), 0);
  assert.ok(ink(inhale) > 0);
  assert.ok(ink(rainFrame(stateAt(4000, config), 72)) > 0);
  assert.ok(ink(rainFrame(stateAt(11999, config), 72)) > 0);
  const rest = rainFrame(stateAt(12000, config), 72);
  assert.equal(ink(rest), 0);
  assert.deepEqual(rest, rainFrame(stateAt(15900, config), 72));
});

test('drops move between one-second status-line updates', () => {
  const first = rainFrame(stateAt(1800, config), 72);
  const next = rainFrame(stateAt(2300, config), 72);
  assert.notDeepEqual(first, next);
});

test('drop paths are deterministic and independent of render order', () => {
  const state = stateAt(3000, config);
  const first = rainFrame(state, 72);
  rainFrame(stateAt(10000, config), 72);
  assert.deepEqual(rainFrame(state, 72), first);
});

test('rain stays visible through every exhale frame and stops at rest', () => {
  const phaseMs = config.count * 1000;
  for (let round = 0; round < config.rounds; round++) {
    const start = (round * 4 + 2) * phaseMs;
    for (const [width, height] of [[1, 1], [8, 2], [72, 4]]) {
      const finalFrames = new Set();
      for (let into = 0; into < phaseMs; into += 100) {
        const frame = rainFrame(stateAt(start + into, config), width, height);
        if (into >= phaseMs - 1000) finalFrames.add(frame.join('\n'));
        assert.ok(ink(frame) > 0,
          `round=${round + 1}, exhale=${into}ms, size=${width}x${height}`);
      }
      assert.ok(finalFrames.size > 1, 'rain must keep moving in the final second');
      assert.ok(ink(rainFrame(stateAt(start + phaseMs - 1, config), width, height)) > 0);
      assert.equal(ink(rainFrame(stateAt(start + phaseMs, config), width, height)), 0);
    }
  }
});
