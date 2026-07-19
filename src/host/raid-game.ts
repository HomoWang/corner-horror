import * as THREE from 'three';
import {
  RaidEngine,
  type RaidEnemyKind,
  type RaidEnemyState,
  type RaidEngineEvent,
  type RaidSnapshot,
} from '../shared/raid-engine';

interface RaidCallbacks {
  onSnapshot(snapshot: RaidSnapshot): void;
  onMessage(message: string): void;
  onShot(result: 'hit' | 'miss' | 'kill'): void;
  onPlayerHit(): void;
  onImpact(): void;
}

interface EnemyVisual {
  root: THREE.Group;
  kind: RaidEnemyKind;
  age: number;
  attackIn: number;
  seed: number;
  flash: number;
  phase: number;
}

interface Tracer {
  line: THREE.Line<THREE.BufferGeometry, THREE.LineBasicMaterial>;
  ttl: number;
}

interface Particle {
  mesh: THREE.Mesh<THREE.SphereGeometry, THREE.MeshBasicMaterial>;
  velocity: THREE.Vector3;
  ttl: number;
}

const ENEMY_COLORS: Record<RaidEnemyKind, number> = {
  crawler: 0x63ff9b,
  brute: 0xff9d2e,
  boss: 0xff315f,
};

export class RaidGame {
  private readonly engine = new RaidEngine();
  private readonly root = new THREE.Group();
  private readonly enemies = new Map<string, EnemyVisual>();
  private readonly raycaster = new THREE.Raycaster();
  private readonly tracers: Tracer[] = [];
  private readonly particles: Particle[] = [];
  private triggerWasPressed = false;
  private fireCooldown = 0;
  private active = false;

  constructor(
    scene: THREE.Scene,
    private readonly origin: THREE.Vector3,
    private readonly callbacks: RaidCallbacks,
  ) {
    this.root.visible = false;
    scene.add(this.root);
  }

  start(): void {
    this.clearActionObjects();
    this.active = true;
    this.root.visible = true;
    this.triggerWasPressed = false;
    this.fireCooldown = 0;
    this.process(this.engine.start());
    this.callbacks.onSnapshot(this.engine.snapshot());
  }

  reset(): void {
    this.active = false;
    this.root.visible = false;
    this.triggerWasPressed = false;
    this.clearActionObjects();
  }

  update(delta: number, direction: THREE.Vector3 | null, triggerPressed: boolean): void {
    if (!this.active) return;
    const snapshot = this.engine.snapshot();
    if (snapshot.phase === 'victory' || snapshot.phase === 'defeat') {
      if (triggerPressed && !this.triggerWasPressed) this.start();
      this.triggerWasPressed = triggerPressed;
      this.updateEffects(delta);
      return;
    }

    this.fireCooldown = Math.max(0, this.fireCooldown - delta);
    if (triggerPressed && direction && (!this.triggerWasPressed || this.fireCooldown === 0)) {
      this.fire(direction);
      this.fireCooldown = 0.145;
    }
    this.triggerWasPressed = triggerPressed;

    for (const [id, visual] of this.enemies) {
      visual.age += delta;
      visual.attackIn -= delta;
      visual.flash = Math.max(0, visual.flash - delta);
      this.animateEnemy(visual, delta);
      this.setEnemyFlash(visual, visual.flash > 0);
      if (visual.attackIn <= 0) {
        visual.attackIn = this.attackInterval(visual);
        this.process(this.engine.damagePlayer(id));
      }
    }
    this.updateEffects(delta);
  }

  private fire(direction: THREE.Vector3): void {
    this.raycaster.set(this.origin, direction.clone().normalize());
    const roots = [...this.enemies.values()].map((enemy) => enemy.root);
    const intersection = this.raycaster.intersectObjects(roots, true)[0];
    const end = intersection?.point ?? this.origin.clone().addScaledVector(direction, 14);
    this.spawnTracer(end, Boolean(intersection));

    if (!intersection) {
      this.process(this.engine.shoot(null));
      return;
    }
    const enemyId = this.findEnemyId(intersection.object);
    const damage = this.findDamage(intersection.object);
    this.process(this.engine.shoot(enemyId, damage));
  }

  private process(events: readonly RaidEngineEvent[]): void {
    for (const event of events) {
      if (event.type === 'wave-started') {
        this.callbacks.onMessage(
          event.wave === 3 ? '警告：巨獸核心反應急升' : `第 ${event.wave} 波來襲`,
        );
        event.enemies.forEach((enemy, index) => this.spawnEnemy(enemy, index));
      }
      if (event.type === 'hit') {
        const visual = this.enemies.get(event.enemy.id);
        if (visual) visual.flash = 0.08;
        this.callbacks.onShot('hit');
        this.callbacks.onImpact();
      }
      if (event.type === 'miss') this.callbacks.onShot('miss');
      if (event.type === 'enemy-killed') {
        const visual = this.enemies.get(event.enemy.id);
        if (visual) {
          this.spawnBurst(visual.root.position, event.enemy.kind);
          visual.root.removeFromParent();
          this.enemies.delete(event.enemy.id);
        }
        this.callbacks.onShot('kill');
      }
      if (event.type === 'boss-phase') {
        const visual = this.enemies.get(event.enemy.id);
        if (visual) visual.phase = event.phase;
        this.callbacks.onMessage(`巨獸進入第 ${event.phase} 階段：攻擊加速`);
      }
      if (event.type === 'player-hit') this.callbacks.onPlayerHit();
      if (event.type === 'victory') this.callbacks.onMessage('巨獸已殲滅｜扣下扳機再玩一次');
      if (event.type === 'defeat') this.callbacks.onMessage('防線失守｜扣下扳機重新出擊');
    }
    if (events.length > 0) this.callbacks.onSnapshot(this.engine.snapshot());
  }

  private spawnEnemy(enemy: RaidEnemyState, index: number): void {
    const root = this.createCreature(enemy);
    const spread = enemy.kind === 'boss' ? 0 : (index - 2) * 1.15;
    root.position.set(spread, enemy.kind === 'crawler' ? 0.7 : 1.35, enemy.kind === 'boss' ? -8.8 : -7.4 - (index % 2));
    root.scale.setScalar(0.01);
    this.root.add(root);
    this.enemies.set(enemy.id, {
      root,
      kind: enemy.kind,
      age: 0,
      attackIn: enemy.kind === 'boss' ? 3.6 : 2.8 + index * 0.45,
      seed: index * 1.73 + this.enemies.size * 0.61,
      flash: 0,
      phase: 1,
    });
  }

  private createCreature(enemy: RaidEnemyState): THREE.Group {
    const group = new THREE.Group();
    const color = ENEMY_COLORS[enemy.kind];
    const bodyGeometry = enemy.kind === 'boss'
      ? new THREE.IcosahedronGeometry(1.45, 1)
      : enemy.kind === 'brute'
        ? new THREE.DodecahedronGeometry(0.72, 0)
        : new THREE.SphereGeometry(0.44, 18, 12);
    const body = this.enemyMesh(bodyGeometry, color, enemy.id, 1);
    group.add(body);

    const eyeSize = enemy.kind === 'boss' ? 0.34 : 0.15;
    const eye = this.enemyMesh(new THREE.SphereGeometry(eyeSize, 16, 12), 0xcfffff, enemy.id, 2);
    eye.position.set(0, enemy.kind === 'boss' ? 0.1 : 0.05, enemy.kind === 'boss' ? 1.35 : 0.4);
    eye.userData.weakPoint = true;
    group.add(eye);

    const limbCount = enemy.kind === 'boss' ? 8 : enemy.kind === 'brute' ? 4 : 6;
    for (let i = 0; i < limbCount; i += 1) {
      const angle = (i / limbCount) * Math.PI * 2;
      const limb = this.enemyMesh(
        new THREE.ConeGeometry(enemy.kind === 'boss' ? 0.16 : 0.07, enemy.kind === 'boss' ? 1.9 : 0.72, 6),
        color,
        enemy.id,
        1,
      );
      limb.position.set(Math.cos(angle) * (enemy.kind === 'boss' ? 1.35 : 0.43), -0.22, Math.sin(angle) * (enemy.kind === 'boss' ? 1.35 : 0.43));
      limb.rotation.z = angle + Math.PI / 2;
      group.add(limb);
    }
    group.userData.enemyId = enemy.id;
    return group;
  }

  private enemyMesh(geometry: THREE.BufferGeometry, color: number, enemyId: string, damage: number): THREE.Mesh {
    const material = new THREE.MeshBasicMaterial({ color });
    const mesh = new THREE.Mesh(geometry, material);
    mesh.userData.enemyId = enemyId;
    mesh.userData.damage = damage;
    mesh.userData.baseColor = color;
    return mesh;
  }

  private animateEnemy(visual: EnemyVisual, delta: number): void {
    const targetScale = visual.kind === 'boss' ? 1 : visual.kind === 'brute' ? 1.15 : 1;
    const scale = THREE.MathUtils.lerp(visual.root.scale.x, targetScale, 1 - Math.exp(-delta * 4.5));
    visual.root.scale.setScalar(scale);
    const speed = visual.kind === 'boss' ? 0.055 * visual.phase : visual.kind === 'brute' ? 0.11 : 0.16;
    visual.root.position.z = Math.min(-2.7, visual.root.position.z + delta * speed);
    visual.root.position.x += Math.sin(visual.age * (1.2 + visual.phase * 0.25) + visual.seed) * delta * 0.24;
    visual.root.position.y += Math.sin(visual.age * 3.2 + visual.seed) * delta * 0.08;
    visual.root.rotation.y += delta * (visual.kind === 'boss' ? 0.18 * visual.phase : 0.45);
    visual.root.rotation.z = Math.sin(visual.age * 2 + visual.seed) * 0.05;
  }

  private attackInterval(visual: EnemyVisual): number {
    if (visual.kind === 'boss') return Math.max(0.9, 2.6 - visual.phase * 0.45);
    return visual.kind === 'brute' ? 3.4 : 4.2;
  }

  private setEnemyFlash(visual: EnemyVisual, active: boolean): void {
    visual.root.traverse((object) => {
      if (!(object instanceof THREE.Mesh) || !(object.material instanceof THREE.MeshBasicMaterial)) return;
      object.material.color.setHex(active ? 0xffffff : (object.userData.baseColor as number));
    });
  }

  private findEnemyId(object: THREE.Object3D): string | null {
    let current: THREE.Object3D | null = object;
    while (current) {
      if (typeof current.userData.enemyId === 'string') return current.userData.enemyId as string;
      current = current.parent;
    }
    return null;
  }

  private findDamage(object: THREE.Object3D): number {
    return typeof object.userData.damage === 'number' ? object.userData.damage : 1;
  }

  private spawnTracer(end: THREE.Vector3, hit: boolean): void {
    const geometry = new THREE.BufferGeometry().setFromPoints([
      this.origin.clone().add(new THREE.Vector3(0, -0.08, -0.1)),
      end,
    ]);
    const material = new THREE.LineBasicMaterial({
      color: hit ? 0xd9ffff : 0x52bfff,
      transparent: true,
      opacity: 0.9,
    });
    const line = new THREE.Line(geometry, material);
    this.root.add(line);
    this.tracers.push({ line, ttl: 0.09 });
  }

  private spawnBurst(position: THREE.Vector3, kind: RaidEnemyKind): void {
    for (let i = 0; i < (kind === 'boss' ? 28 : 12); i += 1) {
      const material = new THREE.MeshBasicMaterial({ color: ENEMY_COLORS[kind], transparent: true });
      const mesh = new THREE.Mesh(new THREE.SphereGeometry(kind === 'boss' ? 0.09 : 0.045, 6, 4), material);
      mesh.position.copy(position);
      this.root.add(mesh);
      this.particles.push({
        mesh,
        velocity: new THREE.Vector3((Math.random() - 0.5) * 4, Math.random() * 3, (Math.random() - 0.5) * 3),
        ttl: 0.65 + Math.random() * 0.45,
      });
    }
  }

  private updateEffects(delta: number): void {
    for (let i = this.tracers.length - 1; i >= 0; i -= 1) {
      const tracer = this.tracers[i]!;
      tracer.ttl -= delta;
      tracer.line.material.opacity = Math.max(0, tracer.ttl / 0.09);
      if (tracer.ttl <= 0) {
        tracer.line.removeFromParent();
        tracer.line.geometry.dispose();
        tracer.line.material.dispose();
        this.tracers.splice(i, 1);
      }
    }
    for (let i = this.particles.length - 1; i >= 0; i -= 1) {
      const particle = this.particles[i]!;
      particle.ttl -= delta;
      particle.velocity.y -= delta * 2.8;
      particle.mesh.position.addScaledVector(particle.velocity, delta);
      particle.mesh.material.opacity = Math.max(0, particle.ttl / 0.9);
      if (particle.ttl <= 0) {
        particle.mesh.removeFromParent();
        particle.mesh.geometry.dispose();
        particle.mesh.material.dispose();
        this.particles.splice(i, 1);
      }
    }
  }

  private clearActionObjects(): void {
    for (const enemy of this.enemies.values()) enemy.root.removeFromParent();
    this.enemies.clear();
    for (const tracer of this.tracers) tracer.line.removeFromParent();
    this.tracers.length = 0;
    for (const particle of this.particles) particle.mesh.removeFromParent();
    this.particles.length = 0;
  }
}
