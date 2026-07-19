import * as THREE from 'three';
import { raidParticleBudget, type RaidQuality } from '../shared/raid-performance';
export type { RaidQuality } from '../shared/raid-performance';

const VERTEX_SHADER = `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

const FRAGMENT_SHADER = `
  uniform sampler2D plate;
  uniform float plateReady;
  uniform float time;
  uniform float intensity;
  uniform float damage;
  uniform vec2 aim;
  varying vec2 vUv;

  float hash(vec2 p) {
    return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
  }

  float noise(vec2 p) {
    vec2 i = floor(p);
    vec2 f = fract(p);
    f = f * f * (3.0 - 2.0 * f);
    return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), f.x),
      mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), f.x), f.y);
  }

  void main() {
    vec2 drift = vec2(sin(time * 0.11), cos(time * 0.09)) * 0.0025;
    drift += aim * 0.004;
    vec3 fallback = mix(vec3(0.012, 0.035, 0.06), vec3(0.08, 0.16, 0.2), 1.0 - vUv.y);
    vec3 source = texture2D(plate, clamp(vUv + drift, 0.002, 0.998)).rgb;
    vec3 color = mix(fallback, source, plateReady);

    float smokeA = noise(vUv * vec2(4.0, 2.2) + vec2(time * 0.025, -time * 0.012));
    float smokeB = noise(vUv * vec2(9.0, 4.8) + vec2(-time * 0.018, time * 0.021));
    float smoke = smoothstep(0.45, 0.82, smokeA * 0.62 + smokeB * 0.5);
    smoke *= smoothstep(0.08, 0.55, vUv.y) * (0.08 + intensity * 0.12);
    color = mix(color, vec3(0.12, 0.2, 0.24), smoke);

    float lightningSeed = sin(time * 0.47) * sin(time * 1.93) * sin(time * 3.77);
    float lightning = smoothstep(0.965, 1.0, lightningSeed) * (0.08 + intensity * 0.18);
    color += vec3(0.36, 0.63, 0.8) * lightning * smoothstep(0.25, 0.88, vUv.y);

    float fireNoise = noise(vec2(vUv.x * 17.0, time * 5.5 + vUv.y * 8.0));
    float fireMask = (1.0 - smoothstep(0.03, 0.42, vUv.y)) * smoothstep(0.62, 0.93, fireNoise);
    color += vec3(0.8, 0.2, 0.025) * fireMask * intensity * 0.3;

    vec2 centered = vUv * 2.0 - 1.0;
    float vignette = smoothstep(1.45, 0.32, dot(centered, centered));
    color *= 0.58 + vignette * 0.48;
    color = mix(color, vec3(0.75, 0.015, 0.02), damage * (0.18 + (1.0 - vignette) * 0.3));
    color *= 0.94 + hash(gl_FragCoord.xy + time * 43.0) * 0.045;
    gl_FragColor = vec4(color, 1.0);
  }
`;

export class RaidBackdrop {
  private readonly material: THREE.ShaderMaterial;
  private readonly mesh: THREE.Mesh<THREE.PlaneGeometry, THREE.ShaderMaterial>;
  private readonly embers: THREE.Points<THREE.BufferGeometry, THREE.PointsMaterial>;
  private readonly emberPositions: Float32Array;
  private readonly emberSpeeds: Float32Array;
  private elapsed = 0;
  private damage = 0;
  private quality: RaidQuality = 'high';
  private loaded = false;

  constructor(
    private readonly camera: THREE.PerspectiveCamera,
    private readonly assetUrl: string,
    parent: THREE.Group,
  ) {
    const placeholder = new THREE.DataTexture(new Uint8Array([3, 10, 17, 255]), 1, 1);
    placeholder.needsUpdate = true;
    this.material = new THREE.ShaderMaterial({
      uniforms: {
        plate: { value: placeholder },
        plateReady: { value: 0 },
        time: { value: 0 },
        intensity: { value: 0.25 },
        damage: { value: 0 },
        aim: { value: new THREE.Vector2() },
      },
      vertexShader: VERTEX_SHADER,
      fragmentShader: FRAGMENT_SHADER,
      depthTest: false,
      depthWrite: false,
      toneMapped: false,
    });
    this.mesh = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), this.material);
    this.mesh.position.set(0, 1.6, -11);
    this.mesh.renderOrder = -50;
    this.mesh.frustumCulled = false;
    parent.add(this.mesh);

    const maxEmbers = 260;
    this.emberPositions = new Float32Array(maxEmbers * 3);
    this.emberSpeeds = new Float32Array(maxEmbers);
    for (let i = 0; i < maxEmbers; i += 1) this.resetEmber(i, true);
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(this.emberPositions, 3));
    const material = new THREE.PointsMaterial({
      color: 0xff8b35,
      size: 0.035,
      transparent: true,
      opacity: 0.74,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });
    this.embers = new THREE.Points(geometry, material);
    this.embers.renderOrder = 2;
    parent.add(this.embers);
    this.setQuality('high');
    this.resize(innerWidth, innerHeight);
  }

  preload(onProgress: (value: number) => void): Promise<boolean> {
    if (this.loaded) return Promise.resolve(true);
    onProgress(0.08);
    return new Promise((resolve) => {
      let settled = false;
      let simulatedProgress = 0.08;
      const progressTimer = window.setInterval(() => {
        simulatedProgress = Math.min(0.86, simulatedProgress + 0.018);
        onProgress(simulatedProgress);
      }, 260);
      const finish = (success: boolean) => {
        if (settled) return;
        settled = true;
        clearInterval(progressTimer);
        onProgress(1);
        resolve(success);
      };
      const timeout = window.setTimeout(() => finish(false), 12_000);
      new THREE.TextureLoader().load(
        this.assetUrl,
        (texture) => {
          if (settled) return;
          clearTimeout(timeout);
          texture.colorSpace = THREE.SRGBColorSpace;
          texture.minFilter = THREE.LinearFilter;
          texture.magFilter = THREE.LinearFilter;
          texture.generateMipmaps = false;
          this.material.uniforms.plate!.value = texture;
          this.material.uniforms.plateReady!.value = 1;
          this.loaded = true;
          finish(true);
        },
        (event) => {
          if (event.lengthComputable && event.total > 0) {
            simulatedProgress = Math.max(simulatedProgress, 0.08 + (event.loaded / event.total) * 0.86);
            onProgress(simulatedProgress);
          }
        },
        () => {
          clearTimeout(timeout);
          finish(false);
        },
      );
    });
  }

  update(delta: number, direction: THREE.Vector3 | null, intensity: number): void {
    this.elapsed += delta;
    this.damage = Math.max(0, this.damage - delta * 2.8);
    this.material.uniforms.time!.value = this.elapsed;
    this.material.uniforms.intensity!.value = THREE.MathUtils.lerp(
      this.material.uniforms.intensity!.value as number,
      intensity,
      1 - Math.exp(-delta * 1.8),
    );
    this.material.uniforms.damage!.value = this.damage;
    const aim = this.material.uniforms.aim!.value as THREE.Vector2;
    aim.set(direction?.x ?? 0, direction?.y ?? 0);

    const visible = this.embers.geometry.drawRange.count;
    for (let i = 0; i < visible; i += 1) {
      const offset = i * 3;
      this.emberPositions[offset + 1]! += this.emberSpeeds[i]! * delta;
      this.emberPositions[offset]! += Math.sin(this.elapsed * 1.7 + i) * delta * 0.05;
      if (this.emberPositions[offset + 1]! > 4.8) this.resetEmber(i, false);
    }
    (this.embers.geometry.getAttribute('position') as THREE.BufferAttribute).needsUpdate = true;
  }

  pulseDamage(): void {
    this.damage = 1;
  }

  setQuality(quality: RaidQuality): void {
    this.quality = quality;
    const count = raidParticleBudget(quality);
    this.embers.geometry.setDrawRange(0, count);
    this.embers.material.size = quality === 'low' ? 0.025 : 0.035;
  }

  get currentQuality(): RaidQuality {
    return this.quality;
  }

  resize(width: number, height: number): void {
    const distance = Math.abs(this.mesh.position.z - this.camera.position.z);
    const viewHeight = 2 * Math.tan(THREE.MathUtils.degToRad(this.camera.fov * 0.5)) * distance;
    const viewWidth = viewHeight * (width / height);
    const imageAspect = 16 / 9;
    if (viewWidth / viewHeight > imageAspect) {
      this.mesh.scale.set(viewWidth, viewWidth / imageAspect, 1);
    } else {
      this.mesh.scale.set(viewHeight * imageAspect, viewHeight, 1);
    }
  }

  private resetEmber(index: number, initial: boolean): void {
    const offset = index * 3;
    this.emberPositions[offset] = (Math.random() - 0.5) * 12;
    this.emberPositions[offset + 1] = initial ? Math.random() * 5 : -0.2;
    this.emberPositions[offset + 2] = -3 - Math.random() * 7;
    this.emberSpeeds[index] = 0.18 + Math.random() * 0.58;
  }
}
