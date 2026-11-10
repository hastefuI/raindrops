// Pure JavaScript: shared by the host sandbox and Node's test runner.
export const PHASES = [
  { name: 'Inhale', label: 'inhale' },
  { name: 'Hold full', label: 'hold' },
  { name: 'Exhale', label: 'exhale' },
  { name: 'Hold empty', label: 'rest' },
];
export const PREPARE_MS = 3000;
export const MAX_GAP_MS = 1500;

const COUNT = 4;
const ROUNDS = 4;
export const ROUTINE = Object.freeze({ count: COUNT, rounds: ROUNDS, totalMs: COUNT * 1000 * PHASES.length * ROUNDS });

export const isActive = status => status === 'prepare' || status === 'running';

// How full the breath is: rises on inhale, holds, falls on exhale, rests empty.
export const level = (phaseIndex, progress) => [progress, 1, 1 - progress, 0][phaseIndex];

export function parseAction(text = '') {
  const action = text.trim() || 'start';
  if (!['start', 'stop', 'exit'].includes(action)) {
    throw new Error('Use /raindrops start, /raindrops stop, or /raindrops exit.');
  }
  return action;
}

export function stateAt(elapsedMs, config = ROUTINE) {
  const elapsed = Math.max(0, Math.min(elapsedMs, config.totalMs));
  const done = elapsed >= config.totalMs;
  const phaseMs = config.count * 1000;
  const roundMs = phaseMs * PHASES.length;
  const phaseNumber = Math.floor(elapsed / phaseMs);
  const phaseIndex = phaseNumber % PHASES.length;
  const progress = (elapsed % phaseMs) / phaseMs;
  return {
    done, elapsedMs: elapsed, phaseIndex, phase: PHASES[phaseIndex], progress,
    secLeft: Math.ceil((phaseMs - elapsed % phaseMs) / 1000),
    round: Math.min(config.rounds, Math.floor(elapsed / roundMs) + 1),
    roundsCompleted: Math.floor(elapsed / roundMs),
    fill: done ? 0 : level(phaseIndex, progress),
  };
}

export class Session {
  config = ROUTINE;
  status = 'ready';
  state = stateAt(0, ROUTINE);
  prepareLeft = PREPARE_MS / 1000;
  startedAt = 0;
  previous = 0;
  start(now) {
    // Begin again from a new session's values.
    Object.assign(this, new Session(), { status: 'prepare', startedAt: now + PREPARE_MS, previous: now });
  }
  tick(now) {
    if (!isActive(this.status)) return;
    // Never replay missed cues after sleep, a clock change, or a stalled host.
    if (now < this.previous || now - this.previous > MAX_GAP_MS) {
      this.status = 'interrupted';
      return;
    }
    this.previous = now;
    if (now < this.startedAt) {
      this.prepareLeft = Math.ceil((this.startedAt - now) / 1000);
      return;
    }
    this.status = 'running';
    this.state = stateAt(now - this.startedAt, this.config);
    if (this.state.done) this.status = 'done';
  }
  stop() {
    if (isActive(this.status)) this.status = 'stopped';
  }
}
