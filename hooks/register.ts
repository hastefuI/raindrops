import { atom, read, update } from 'claude-code';
import type { EngineInterface, Register, Timer } from 'claude-code';
import type { Band } from '../types';
import { isActive, parseAction, Session } from '../lib/breathing.js';
import { drawRain } from '../lib/rain.js';
import { drawLine, statusLine } from '../lib/status.js';

// What the band above the prompt draws, or null while the indicator is closed.
// It lives in $.state so each write redraws the band, and outlives a reload,
// which the session.start hook answers by clearing it. Bump the shape when
// Band's fields change.
const band = atom({ plugin: 'raindrops', key: 'band' } as const, null as Band | null, { shape: 'band-1' });

// The module's own values: a reload starts them over.
type Run = {
  session: Session;
  visible: boolean;
  generation: number;
  timer: Timer | undefined;
};

function draw($: EngineInterface, run: Run) {
  const { session } = run;
  const { phaseIndex, progress, round } = session.state;
  const value = run.visible ? {
    line: statusLine(session),
    rain: isActive(session.status) ? { phaseIndex, progress, round } : null,
  } : null;
  return update($, band, () => value);
}

// Cancels the running timer and marks every older callback stale.
function halt(run: Run) {
  run.generation += 1;
  run.timer?.cancel();
  run.timer = undefined;
}

// A session that starts, reloads or ends shows no exercise.
function clear($: EngineInterface, run: Run) {
  halt(run);
  run.session.stop();
  run.visible = false;
  return draw($, run);
}

export const register: Register = on => {
  const run: Run = { session: new Session(), visible: false, generation: 0, timer: undefined };

  on('session.start', async ($, e, next) => {
    // Version 0.6.0 pinned its line with $.ui.status. Drop one left behind.
    $.ui.status(undefined);
    await clear($, run);
    await $.command.register({
      name: 'raindrops', description: 'Box breathing with an indicator and rain above the prompt',
      argumentHint: '[start|stop|exit]', immediate: true,
    });
    return next(e);
  });

  on('command.run', { command: 'raindrops' }, async ($, e) => {
    let action;
    try { action = parseAction(e.args); }
    catch (error) { return { text: (error as Error).message }; }
    halt(run);
    const ticket = run.generation;
    const now = await $.clock.now();
    if (ticket !== run.generation) return {};
    run.visible = action !== 'exit';
    if (action === 'start') {
      run.session.start(now);
      const tick = $.clock.every(100, async () => {
        const now = await $.clock.now();
        if (ticket !== run.generation) return;
        run.session.tick(now);
        if (!isActive(run.session.status)) tick.cancel();
        await draw($, run);
      });
      run.timer = tick;
    } else run.session.stop();
    await draw($, run);
    return {};
  });

  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    // Read first: the read subscribes this band to every later write.
    const value = await read($, band);
    const { hasSurvey, maxRows, bodyColumns } = e.props;
    if (!value || hasSurvey || maxRows < 1 || bodyColumns < 8) return next(e);
    const other = await next(e);
    const { Box } = $.ui.resolve(e);
    // The line always shows. The rain takes the rows left above it.
    const rain = value.rain && maxRows >= 3 ? [drawRain($, e, value.rain, maxRows - 1)] : [];
    return Box({ flexDirection: 'column', children: [...rain, drawLine($, e, value.line), other] });
  });

  on('session.end', async ($, e, next) => {
    await clear($, run);
    return next(e);
  });
};
