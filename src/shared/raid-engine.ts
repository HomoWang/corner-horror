export type RaidEnemyKind = 'crawler' | 'brute' | 'boss';

export interface RaidEnemySpec {
  kind: RaidEnemyKind;
  hp: number;
  score: number;
  contactDamage: number;
}

export interface RaidEnemyState extends RaidEnemySpec {
  id: string;
  maxHp: number;
  bossPhase: number;
}

export interface RaidWave {
  enemies: readonly RaidEnemySpec[];
}

export type RaidPhase = 'idle' | 'running' | 'victory' | 'defeat';

export interface RaidSnapshot {
  phase: RaidPhase;
  wave: number;
  totalWaves: number;
  score: number;
  combo: number;
  hp: number;
  maxHp: number;
  enemies: readonly RaidEnemyState[];
}

export type RaidEngineEvent =
  | { type: 'wave-started'; wave: number; enemies: readonly RaidEnemyState[] }
  | { type: 'hit'; enemy: RaidEnemyState; damage: number }
  | { type: 'enemy-killed'; enemy: RaidEnemyState; score: number }
  | { type: 'boss-phase'; enemy: RaidEnemyState; phase: number }
  | { type: 'miss' }
  | { type: 'player-hit'; damage: number; hp: number }
  | { type: 'victory' }
  | { type: 'defeat' };

export const DEFAULT_RAID_WAVES: readonly RaidWave[] = [
  {
    enemies: Array.from({ length: 5 }, () => ({
      kind: 'crawler' as const,
      hp: 2,
      score: 180,
      contactDamage: 7,
    })),
  },
  {
    enemies: [
      ...Array.from({ length: 4 }, () => ({
        kind: 'crawler' as const,
        hp: 2,
        score: 200,
        contactDamage: 8,
      })),
      { kind: 'brute', hp: 7, score: 700, contactDamage: 16 },
    ],
  },
  {
    enemies: [{ kind: 'boss', hp: 36, score: 5000, contactDamage: 22 }],
  },
];

export class RaidEngine {
  private phase: RaidPhase = 'idle';
  private waveIndex = -1;
  private score = 0;
  private combo = 0;
  private hp: number;
  private readonly enemies = new Map<string, RaidEnemyState>();
  private nextEnemyId = 1;

  constructor(
    private readonly waves: readonly RaidWave[] = DEFAULT_RAID_WAVES,
    private readonly maxHp = 100,
  ) {
    if (waves.length === 0) throw new Error('Raid requires at least one wave');
    this.hp = maxHp;
  }

  start(): RaidEngineEvent[] {
    this.phase = 'running';
    this.waveIndex = -1;
    this.score = 0;
    this.combo = 0;
    this.hp = this.maxHp;
    this.enemies.clear();
    this.nextEnemyId = 1;
    return this.startNextWave();
  }

  shoot(enemyId: string | null, damage = 1): RaidEngineEvent[] {
    if (this.phase !== 'running') return [];
    const enemy = enemyId ? this.enemies.get(enemyId) : undefined;
    if (!enemy || damage <= 0) {
      this.combo = 0;
      return [{ type: 'miss' }];
    }

    const previousBossPhase = enemy.bossPhase;
    enemy.hp = Math.max(0, enemy.hp - damage);
    this.combo += 1;
    const events: RaidEngineEvent[] = [{ type: 'hit', enemy: { ...enemy }, damage }];

    if (enemy.kind === 'boss' && enemy.hp > 0) {
      enemy.bossPhase = enemy.hp <= enemy.maxHp / 3 ? 3 : enemy.hp <= (enemy.maxHp * 2) / 3 ? 2 : 1;
      if (enemy.bossPhase !== previousBossPhase) {
        events.push({ type: 'boss-phase', enemy: { ...enemy }, phase: enemy.bossPhase });
      }
    }

    if (enemy.hp === 0) {
      const gained = enemy.score + Math.min(this.combo, 20) * 25;
      this.score += gained;
      this.enemies.delete(enemy.id);
      events.push({ type: 'enemy-killed', enemy: { ...enemy }, score: gained });
      if (this.enemies.size === 0) events.push(...this.startNextWave());
    }
    return events;
  }

  damagePlayer(enemyId: string): RaidEngineEvent[] {
    if (this.phase !== 'running') return [];
    const enemy = this.enemies.get(enemyId);
    if (!enemy) return [];
    this.combo = 0;
    this.hp = Math.max(0, this.hp - enemy.contactDamage);
    const events: RaidEngineEvent[] = [
      { type: 'player-hit', damage: enemy.contactDamage, hp: this.hp },
    ];
    if (this.hp === 0) {
      this.phase = 'defeat';
      events.push({ type: 'defeat' });
    }
    return events;
  }

  snapshot(): RaidSnapshot {
    return {
      phase: this.phase,
      wave: Math.max(0, this.waveIndex + 1),
      totalWaves: this.waves.length,
      score: this.score,
      combo: this.combo,
      hp: this.hp,
      maxHp: this.maxHp,
      enemies: [...this.enemies.values()].map((enemy) => ({ ...enemy })),
    };
  }

  private startNextWave(): RaidEngineEvent[] {
    this.waveIndex += 1;
    if (this.waveIndex >= this.waves.length) {
      this.phase = 'victory';
      return [{ type: 'victory' }];
    }

    const spawned = this.waves[this.waveIndex]!.enemies.map((spec) => {
      const enemy: RaidEnemyState = {
        ...spec,
        id: `enemy-${this.nextEnemyId++}`,
        maxHp: spec.hp,
        bossPhase: 1,
      };
      this.enemies.set(enemy.id, enemy);
      return { ...enemy };
    });
    return [{ type: 'wave-started', wave: this.waveIndex + 1, enemies: spawned }];
  }
}
