import { describe, expect, it } from 'vitest';
import { RaidEngine, type RaidWave } from '../src/shared/raid-engine';

const waves: readonly RaidWave[] = [
  { enemies: [{ kind: 'crawler', hp: 1, score: 100, contactDamage: 10 }] },
  { enemies: [{ kind: 'boss', hp: 6, score: 1000, contactDamage: 40 }] },
];

describe('RaidEngine', () => {
  it('advances waves and awards combo score', () => {
    const engine = new RaidEngine(waves);
    const start = engine.start();
    const crawlerId = engine.snapshot().enemies[0]!.id;

    expect(start[0]).toMatchObject({ type: 'wave-started', wave: 1 });
    const events = engine.shoot(crawlerId);

    expect(events.map((event) => event.type)).toEqual([
      'hit',
      'enemy-killed',
      'wave-started',
    ]);
    expect(engine.snapshot()).toMatchObject({ wave: 2, score: 125, combo: 1 });
  });

  it('changes boss phases and reaches victory', () => {
    const engine = new RaidEngine([{ enemies: waves[1]!.enemies }]);
    engine.start();
    const bossId = engine.snapshot().enemies[0]!.id;

    expect(engine.shoot(bossId, 2).map((event) => event.type)).toContain('boss-phase');
    expect(engine.snapshot().enemies[0]!.bossPhase).toBe(2);
    expect(engine.shoot(bossId, 2).map((event) => event.type)).toContain('boss-phase');
    const finalEvents = engine.shoot(bossId, 2);

    expect(finalEvents.map((event) => event.type)).toEqual([
      'hit',
      'enemy-killed',
      'victory',
    ]);
    expect(engine.snapshot().phase).toBe('victory');
  });

  it('resets combo on misses and can defeat the player', () => {
    const engine = new RaidEngine(waves, 50);
    engine.start();
    const enemyId = engine.snapshot().enemies[0]!.id;
    engine.shoot(enemyId, 0.5);
    engine.shoot(null);
    expect(engine.snapshot().combo).toBe(0);

    engine.damagePlayer(enemyId);
    engine.damagePlayer(enemyId);
    engine.damagePlayer(enemyId);
    engine.damagePlayer(enemyId);
    const events = engine.damagePlayer(enemyId);

    expect(events.map((event) => event.type)).toContain('defeat');
    expect(engine.snapshot().phase).toBe('defeat');
  });
});
