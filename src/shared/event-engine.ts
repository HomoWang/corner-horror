export type Direction3 = [number, number, number];

export type EventTrigger =
  | { kind: 'time'; afterMs: number }
  | { kind: 'look'; direction: Direction3; maxAngleDeg: number; dwellMs: number }
  | { kind: 'action' };

export interface ScriptedEventDefinition {
  id: string;
  trigger: EventTrigger;
  requires?: string[];
}

export interface EventSample {
  direction: Direction3 | null;
  actionPressed: boolean;
}

function normalizedDot(left: Direction3, right: Direction3): number {
  const leftLength = Math.hypot(...left);
  const rightLength = Math.hypot(...right);
  if (leftLength === 0 || rightLength === 0) return -1;
  return (left[0] * right[0] + left[1] * right[1] + left[2] * right[2]) / (leftLength * rightLength);
}

export class ScriptedEventEngine {
  private elapsedMs = 0;
  private active = false;
  private previousActionPressed = false;
  private readonly fired = new Set<string>();
  private readonly dwell = new Map<string, number>();

  constructor(private readonly definitions: readonly ScriptedEventDefinition[]) {
    const ids = new Set<string>();
    for (const definition of definitions) {
      if (ids.has(definition.id)) throw new Error(`Duplicate event id: ${definition.id}`);
      ids.add(definition.id);
    }
  }

  start(): void {
    this.reset();
    this.active = true;
  }

  reset(): void {
    this.elapsedMs = 0;
    this.active = false;
    this.previousActionPressed = false;
    this.fired.clear();
    this.dwell.clear();
  }

  hasFired(id: string): boolean {
    return this.fired.has(id);
  }

  update(deltaMs: number, sample: EventSample): string[] {
    if (!this.active) return [];
    this.elapsedMs += Math.max(0, deltaMs);
    const actionRisingEdge = sample.actionPressed && !this.previousActionPressed;
    const triggered: string[] = [];

    for (const definition of this.definitions) {
      if (this.fired.has(definition.id)) continue;
      if (!(definition.requires ?? []).every((id) => this.fired.has(id))) {
        this.dwell.set(definition.id, 0);
        continue;
      }

      let shouldFire = false;
      const trigger = definition.trigger;
      if (trigger.kind === 'time') shouldFire = this.elapsedMs >= trigger.afterMs;
      if (trigger.kind === 'action') shouldFire = actionRisingEdge;
      if (trigger.kind === 'look') {
        const threshold = Math.cos((trigger.maxAngleDeg * Math.PI) / 180);
        const isLooking = sample.direction !== null && normalizedDot(sample.direction, trigger.direction) >= threshold;
        const dwell = isLooking ? (this.dwell.get(definition.id) ?? 0) + Math.max(0, deltaMs) : 0;
        this.dwell.set(definition.id, dwell);
        shouldFire = dwell >= trigger.dwellMs;
      }

      if (shouldFire) {
        this.fired.add(definition.id);
        triggered.push(definition.id);
      }
    }

    this.previousActionPressed = sample.actionPressed;
    return triggered;
  }
}

