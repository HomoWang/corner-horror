import { describe, expect, it } from 'vitest';
import { ScriptedEventEngine, type ScriptedEventDefinition } from '../src/shared/event-engine';

const FORWARD: [number, number, number] = [0, 0, -1];

describe('ScriptedEventEngine', () => {
  it('fires timed events once and obeys dependencies', () => {
    const definitions: ScriptedEventDefinition[] = [
      { id: 'first', trigger: { kind: 'time', afterMs: 1000 } },
      { id: 'second', requires: ['first'], trigger: { kind: 'time', afterMs: 1000 } },
    ];
    const engine = new ScriptedEventEngine(definitions);
    engine.start();
    expect(engine.update(999, { direction: null, actionPressed: false })).toEqual([]);
    expect(engine.update(1, { direction: null, actionPressed: false })).toEqual(['first', 'second']);
    expect(engine.update(1000, { direction: null, actionPressed: false })).toEqual([]);
  });

  it('requires continuous look dwell and resets dwell when looking away', () => {
    const engine = new ScriptedEventEngine([
      {
        id: 'look',
        trigger: { kind: 'look', direction: FORWARD, maxAngleDeg: 10, dwellMs: 500 },
      },
    ]);
    engine.start();
    expect(engine.update(300, { direction: FORWARD, actionPressed: false })).toEqual([]);
    expect(engine.update(50, { direction: [1, 0, 0], actionPressed: false })).toEqual([]);
    expect(engine.update(499, { direction: FORWARD, actionPressed: false })).toEqual([]);
    expect(engine.update(1, { direction: FORWARD, actionPressed: false })).toEqual(['look']);
  });

  it('uses an action rising edge and can reset for a new run', () => {
    const engine = new ScriptedEventEngine([{ id: 'action', trigger: { kind: 'action' } }]);
    engine.start();
    expect(engine.update(16, { direction: null, actionPressed: true })).toEqual(['action']);
    expect(engine.update(16, { direction: null, actionPressed: true })).toEqual([]);
    engine.start();
    expect(engine.update(16, { direction: null, actionPressed: true })).toEqual(['action']);
  });

  it('does nothing until started', () => {
    const engine = new ScriptedEventEngine([{ id: 'time', trigger: { kind: 'time', afterMs: 0 } }]);
    expect(engine.update(100, { direction: null, actionPressed: false })).toEqual([]);
  });
});

