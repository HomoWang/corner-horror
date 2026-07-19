import * as THREE from 'three';
import {
  RaidEngine,
  raidGrade,
  type RaidEnemyKind,
  type RaidEnemyState,
  type RaidEngineEvent,
  type RaidSnapshot,
} from '../shared/raid-engine';
import { RaidBackdrop, type RaidQuality } from './raid-backdrop';

export type RaidFlowPhase = 'menu' | 'briefing' | 'combat' | 'result';

export interface RaidResult {
  victory: boolean;
  score: number;
  accuracy: number;
  kills: number;
  durationSeconds: number;
  grade: ReturnType<typeof raidGrade>;
}

interface RaidCallbacks {
  onSnapshot(snapshot: RaidSnapshot): void;
  onMessage(message: string): void;
  onShot(result: 'hit' | 'miss' | 'kill', weakPoint: boolean): void;
  onFire(): void;
  onPlayerHit(): void;
  onBossPhase(phase: number): void;
  onFlow(phase: RaidFlowPhase): void;
  onResult(result: RaidResult): void;
}

interface EnemyVisual {
  root: THREE.Group;
  core: THREE.Mesh<THREE.SphereGeometry, THREE.MeshBasicMaterial>;
  kind: RaidEnemyKind;
  age: number;
  attackIn: number;
  seed: number;
  flash: number;
  phase: number;
  baseX: number;
  baseY: number;
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
  crawler: 0x183d44,
  brute: 0x4d2d1d,
  boss: 0x321938,
};

export class RaidGame {
  private readonly engine = new RaidEngine();
  private readonly root = new THREE.Group();
  private readonly backdrop: RaidBackdrop;
  private readonly enemies = new Map<string, EnemyVisual>();
  private readonly raycaster = new THREE.Raycaster();
  private readonly tracers: Tracer[] = [];
  private readonly particles: Particle[] = [];
  private readonly particleGeometry = new THREE.SphereGeometry(0.05, 6, 4);
  private triggerWasPressed = false;
  private fireCooldown = 0;
  private active = false;
  private flow: RaidFlowPhase = 'menu';
  private briefingElapsed = 0;
  private briefingStep = 0;
  private combatElapsed = 0;
  private shots = 0;
  private hits = 0;
  private kills = 0;

  constructor(
    scene: THREE.Scene,
    camera: THREE.PerspectiveCamera,
    private readonly origin: THREE.Vector3,
    backdropUrl: string,
    private readonly callbacks: RaidCallbacks,
  ) {
    this.root.visible = false;
    this.backdrop = new RaidBackdrop(camera, backdropUrl, this.root);
    this.root.add(new THREE.HemisphereLight(0x7ed9ff, 0x170b08, 1.25));
    const key = new THREE.PointLight(0x46c7ff, 8, 18, 1.4);
    key.position.set(-3.5, 4.2, -3.5);
    this.root.add(key);
    const fire = new THREE.PointLight(0xff5a1f, 7, 16, 1.6);
    fire.position.set(4.2, 1.2, -5);
    this.root.add(fire);
    scene.add(this.root);
  }

  preload(onProgress: (value: number) => void): Promise<boolean> {
    return this.backdrop.preload(onProgress);
  }

  showMenu(): void {
    this.clearActionObjects();
    this.active = true;
    this.root.visible = true;
    this.flow = 'menu';
    this.triggerWasPressed = false;
    this.callbacks.onFlow('menu');
  }

  start(): void {
    this.clearActionObjects();
    this.active = true;
    this.root.visible = true;
    this.flow = 'briefing';
    this.briefingElapsed = 0;
    this.briefingStep = 0;
    this.combatElapsed = 0;
    this.shots = 0;
    this.hits = 0;
    this.kills = 0;
    this.triggerWasPressed = false;
    this.fireCooldown = 0;
    this.callbacks.onFlow('briefing');
    this.callbacks.onMessage('東區防線失去聯絡｜搜索倖存訊號');
  }

  reset(): void {
    this.active = false;
    this.root.visible = false;
    this.flow = 'menu';
    this.triggerWasPressed = false;
    this.clearActionObjects();
  }

  setQuality(quality: RaidQuality): void {
    this.backdrop.setQuality(quality);
  }

  resize(width: number, height: number): void {
    this.backdrop.resize(width, height);
  }

  update(delta: number, direction: THREE.Vector3 | null, triggerPressed: boolean): void {
    if (!this.active) return;
    const intensity = this.flow === 'combat' ? 0.88 : this.flow === 'briefing' ? 0.48 : 0.24;
    this.backdrop.update(delta, direction, intensity);
    this.updateEffects(delta);

    if (this.flow === 'menu' || this.flow === 'result') {
      this.triggerWasPressed = triggerPressed;
      return;
    }
    if (this.flow === 'briefing') {
      this.updateBriefing(delta);
      this.triggerWasPressed = triggerPressed;
      return;
    }

    this.combatElapsed += delta;
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
  }

  private updateBriefing(delta: number): void {
    this.briefingElapsed += delta;
    if (this.briefingStep === 0 && this.briefingElapsed >= 1.7) {
      this.briefingStep = 1;
      this.callbacks.onMessage('照明系統故障｜使用戰術光束確認前方');
    }
    if (this.briefingStep === 1 && this.briefingElapsed >= 3.5) {
      this.briefingStep = 2;
      this.callbacks.onMessage('大型生命反應逼近｜解除武器保險');
    }
    if (this.briefingElapsed >= 5.1) {
      this.flow = 'combat';
      this.callbacks.onFlow('combat');
      this.process(this.engine.start());
      this.callbacks.onSnapshot(this.engine.snapshot());
    }
  }

  private fire(direction: THREE.Vector3): void {
    this.shots += 1;
    this.callbacks.onFire();
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
    if (enemyId) this.hits += 1;
    this.process(this.engine.shoot(enemyId, damage), damage > 1);
  }

  private process(events: readonly RaidEngineEvent[], weakPoint = false): void {
    for (const event of events) {
      if (event.type === 'wave-started') {
        this.callbacks.onMessage(
          event.wave === 3 ? '泰坦核心鎖定｜集中攻擊發光部位' : `第 ${event.wave} 波接觸`,
        );
        if (event.wave === 3) this.callbacks.onBossPhase(1);
        event.enemies.forEach((enemy, index) => this.spawnEnemy(enemy, index));
      }
      if (event.type === 'hit') {
        const visual = this.enemies.get(event.enemy.id);
        if (visual) visual.flash = 0.075;
        this.callbacks.onShot('hit', weakPoint);
      }
      if (event.type === 'miss') this.callbacks.onShot('miss', false);
      if (event.type === 'enemy-killed') {
        this.kills += 1;
        const visual = this.enemies.get(event.enemy.id);
        if (visual) {
          this.spawnBurst(visual.root.position, event.enemy.kind);
          visual.root.removeFromParent();
          this.disposeEnemy(visual.root);
          this.enemies.delete(event.enemy.id);
        }
        this.callbacks.onShot('kill', weakPoint);
      }
      if (event.type === 'boss-phase') {
        const visual = this.enemies.get(event.enemy.id);
        if (visual) visual.phase = event.phase;
        this.callbacks.onBossPhase(event.phase);
        this.callbacks.onMessage(`泰坦核心過載｜第 ${event.phase} 階段`);
      }
      if (event.type === 'player-hit') {
        this.backdrop.pulseDamage();
        this.callbacks.onPlayerHit();
      }
      if (event.type === 'victory') this.finish(true);
      if (event.type === 'defeat') this.finish(false);
    }
    if (events.length > 0) this.callbacks.onSnapshot(this.engine.snapshot());
  }

  private finish(victory: boolean): void {
    if (this.flow === 'result') return;
    this.flow = 'result';
    this.callbacks.onFlow('result');
    const snapshot = this.engine.snapshot();
    const accuracy = this.shots === 0 ? 0 : Math.round((this.hits / this.shots) * 100);
    const grade = raidGrade(victory, accuracy);
    this.callbacks.onResult({
      victory,
      score: snapshot.score,
      accuracy,
      kills: this.kills,
      durationSeconds: Math.round(this.combatElapsed),
      grade,
    });
  }

  private spawnEnemy(enemy: RaidEnemyState, index: number): void {
    const { root, core } = this.createCreature(enemy);
    const spread = enemy.kind === 'boss' ? 0 : (index - 2) * 1.15;
    const baseY = enemy.kind === 'crawler' ? 0.75 : 1.45;
    root.position.set(spread, baseY, enemy.kind === 'boss' ? -8.8 : -7.4 - (index % 2));
    root.scale.setScalar(0.01);
    this.root.add(root);
    this.enemies.set(enemy.id, {
      root,
      core,
      kind: enemy.kind,
      age: 0,
      attackIn: enemy.kind === 'boss' ? 4.1 : 3.4 + index * 0.55,
      seed: index * 1.73 + this.enemies.size * 0.61,
      flash: 0,
      phase: 1,
      baseX: spread,
      baseY,
    });
  }

  private createCreature(enemy: RaidEnemyState): {
    root: THREE.Group;
    core: THREE.Mesh<THREE.SphereGeometry, THREE.MeshBasicMaterial>;
  } {
    const group = new THREE.Group();
    const color = ENEMY_COLORS[enemy.kind];
    const bodyGeometry = enemy.kind === 'boss'
      ? new THREE.IcosahedronGeometry(1.45, 2)
      : enemy.kind === 'brute'
        ? new THREE.DodecahedronGeometry(0.78, 1)
        : new THREE.IcosahedronGeometry(0.48, 1);
    const body = this.enemyBody(bodyGeometry, color, enemy.id, 1);
    body.scale.set(1, enemy.kind === 'crawler' ? 0.72 : 1, enemy.kind === 'crawler' ? 1.3 : 1);
    group.add(body);

    const coreSize = enemy.kind === 'boss' ? 0.34 : 0.14;
    const core = this.enemyCore(coreSize, enemy.id);
    core.position.set(0, enemy.kind === 'boss' ? 0.12 : 0.03, enemy.kind === 'boss' ? 1.38 : 0.48);
    group.add(core);

    const limbCount = enemy.kind === 'boss' ? 8 : enemy.kind === 'brute' ? 4 : 6;
    for (let i = 0; i < limbCount; i += 1) {
      const angle = (i / limbCount) * Math.PI * 2;
      const limb = this.enemyBody(
        new THREE.ConeGeometry(enemy.kind === 'boss' ? 0.13 : 0.065, enemy.kind === 'boss' ? 1.8 : 0.68, 7),
        color,
        enemy.id,
        1,
      );
      const radius = enemy.kind === 'boss' ? 1.3 : 0.44;
      limb.position.set(Math.cos(angle) * radius, -0.2, Math.sin(angle) * radius);
      limb.rotation.z = angle + Math.PI / 2;
      group.add(limb);
    }

    if (enemy.kind !== 'crawler') {
      const armor = this.enemyBody(new THREE.TorusGeometry(enemy.kind === 'boss' ? 1.05 : 0.52, 0.08, 8, 28), 0x426171, enemy.id, 1);
      armor.rotation.x = Math.PI / 2;
      group.add(armor);
    }
    group.userData.enemyId = enemy.id;
    return { root: group, core };
  }

  private enemyBody(geometry: THREE.BufferGeometry, color: number, enemyId: string, damage: number): THREE.Mesh {
    const material = new THREE.MeshStandardMaterial({
      color,
      roughness: 0.34,
      metalness: 0.4,
      emissive: new THREE.Color(color).multiplyScalar(0.55),
      emissiveIntensity: 0.7,
    });
    const mesh = new THREE.Mesh(geometry, material);
    mesh.userData.enemyId = enemyId;
    mesh.userData.damage = damage;
    mesh.userData.baseColor = color;
    return mesh;
  }

  private enemyCore(size: number, enemyId: string): THREE.Mesh<THREE.SphereGeometry, THREE.MeshBasicMaterial> {
    const material = new THREE.MeshBasicMaterial({ color: 0x9ff8ff });
    const mesh = new THREE.Mesh(new THREE.SphereGeometry(size, 18, 14), material);
    mesh.userData.enemyId = enemyId;
    mesh.userData.damage = 2;
    mesh.userData.baseColor = 0x9ff8ff;
    return mesh;
  }

  private animateEnemy(visual: EnemyVisual, delta: number): void {
    const targetScale = visual.kind === 'boss' ? 1 : visual.kind === 'brute' ? 1.15 : 1;
    const scale = THREE.MathUtils.lerp(visual.root.scale.x, targetScale, 1 - Math.exp(-delta * 4.5));
    visual.root.scale.setScalar(scale);
    const speed = visual.kind === 'boss' ? 0.04 * visual.phase : visual.kind === 'brute' ? 0.075 : 0.11;
    visual.root.position.z = Math.min(-2.8, visual.root.position.z + delta * speed);
    visual.root.position.x = visual.baseX + Math.sin(visual.age * (1.25 + visual.phase * 0.2) + visual.seed) * 0.32;
    visual.root.position.y = visual.baseY + Math.sin(visual.age * 3.1 + visual.seed) * 0.08;
    visual.root.rotation.y += delta * (visual.kind === 'boss' ? 0.16 * visual.phase : 0.38);
    visual.root.rotation.z = Math.sin(visual.age * 2 + visual.seed) * 0.045;
    const warning = visual.attackIn < 0.7;
    visual.core.material.color.setHex(warning ? 0xff315f : 0x9ff8ff);
    visual.core.scale.setScalar(1 + Math.sin(visual.age * (warning ? 18 : 6)) * (warning ? 0.28 : 0.08));
  }

  private attackInterval(visual: EnemyVisual): number {
    if (visual.kind === 'boss') return Math.max(1.25, 3.2 - visual.phase * 0.45);
    return visual.kind === 'brute' ? 4.4 : 5.2;
  }

  private setEnemyFlash(visual: EnemyVisual, active: boolean): void {
    visual.root.traverse((object) => {
      if (!(object instanceof THREE.Mesh)) return;
      const baseColor = object.userData.baseColor as number | undefined;
      if (baseColor === undefined) return;
      if (object.material instanceof THREE.MeshStandardMaterial) {
        object.material.color.setHex(active ? 0xffffff : baseColor);
        object.material.emissive.setHex(active ? 0xffffff : baseColor).multiplyScalar(active ? 1 : 0.55);
      } else if (object.material instanceof THREE.MeshBasicMaterial && object !== visual.core) {
        object.material.color.setHex(active ? 0xffffff : baseColor);
      }
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
      color: hit ? 0xe9ffff : 0x52bfff,
      transparent: true,
      opacity: 0.9,
    });
    const line = new THREE.Line(geometry, material);
    this.root.add(line);
    this.tracers.push({ line, ttl: 0.085 });
  }

  private spawnBurst(position: THREE.Vector3, kind: RaidEnemyKind): void {
    const count = this.backdrop.currentQuality === 'low' ? 7 : kind === 'boss' ? 30 : 14;
    for (let i = 0; i < count; i += 1) {
      const material = new THREE.MeshBasicMaterial({ color: kind === 'boss' ? 0xff3973 : 0x58dfff, transparent: true });
      const mesh = new THREE.Mesh(this.particleGeometry, material);
      mesh.scale.setScalar(kind === 'boss' ? 1.5 : 0.8);
      mesh.position.copy(position);
      this.root.add(mesh);
      this.particles.push({
        mesh,
        velocity: new THREE.Vector3((Math.random() - 0.5) * 4, Math.random() * 3, (Math.random() - 0.5) * 3),
        ttl: 0.62 + Math.random() * 0.4,
      });
    }
  }

  private updateEffects(delta: number): void {
    for (let i = this.tracers.length - 1; i >= 0; i -= 1) {
      const tracer = this.tracers[i]!;
      tracer.ttl -= delta;
      tracer.line.material.opacity = Math.max(0, tracer.ttl / 0.085);
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
        particle.mesh.material.dispose();
        this.particles.splice(i, 1);
      }
    }
  }

  private clearActionObjects(): void {
    for (const enemy of this.enemies.values()) {
      enemy.root.removeFromParent();
      this.disposeEnemy(enemy.root);
    }
    this.enemies.clear();
    for (const tracer of this.tracers) {
      tracer.line.removeFromParent();
      tracer.line.geometry.dispose();
      tracer.line.material.dispose();
    }
    this.tracers.length = 0;
    for (const particle of this.particles) {
      particle.mesh.removeFromParent();
      particle.mesh.material.dispose();
    }
    this.particles.length = 0;
  }

  private disposeEnemy(root: THREE.Group): void {
    root.traverse((object) => {
      if (!(object instanceof THREE.Mesh)) return;
      object.geometry.dispose();
      if (Array.isArray(object.material)) object.material.forEach((material) => material.dispose());
      else object.material.dispose();
    });
  }
}
