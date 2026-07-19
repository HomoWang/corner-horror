import * as THREE from 'three';

const VERTEX_SHADER = `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

const FRAGMENT_SHADER = `
  uniform sampler2D frames;
  uniform float currentFrame;
  uniform float targetFrame;
  uniform float transitionMix;
  uniform vec2 flashlightUv;
  uniform float flashlightStrength;
  uniform float aspect;
  uniform float time;
  varying vec2 vUv;

  vec2 frameUv(float frame, vec2 uv) {
    vec2 insetUv = mix(vec2(0.002), vec2(0.998), uv);
    vec2 offset = vec2(0.0, 0.5);
    if (frame > 0.5 && frame < 1.5) offset = vec2(0.5, 0.5);
    if (frame > 1.5 && frame < 2.5) offset = vec2(0.0, 0.0);
    if (frame > 2.5) offset = vec2(0.5, 0.0);
    return insetUv * 0.5 + offset;
  }

  float random(vec2 position) {
    return fract(sin(dot(position, vec2(12.9898, 78.233))) * 43758.5453);
  }

  void main() {
    vec3 fromColor = texture2D(frames, frameUv(currentFrame, vUv)).rgb;
    vec3 toColor = texture2D(frames, frameUv(targetFrame, vUv)).rgb;
    vec3 sourceColor = mix(fromColor, toColor, smoothstep(0.0, 1.0, transitionMix));
    // 保留暗房層次，但不能把原圖中櫃子與地面壓成全黑。
    sourceColor = pow(sourceColor, vec3(1.52));

    vec2 beamDelta = vUv - flashlightUv;
    beamDelta.x *= aspect;
    float beamDistance = length(beamDelta);
    float beam = smoothstep(0.39, 0.05, beamDistance);
    float hotSpot = smoothstep(0.13, 0.0, beamDistance) * 0.18;
    float breathing = 0.96 + sin(time * 2.7) * 0.025 + sin(time * 8.1) * 0.012;
    float lightAmount = 0.13 + flashlightStrength * (beam * 1.08 + hotSpot) * breathing;

    vec2 centered = vUv * 2.0 - 1.0;
    float vignette = 1.0 - smoothstep(0.45, 1.35, dot(centered, centered));
    float grain = (random(gl_FragCoord.xy + time * 61.0) - 0.5) * 0.018;
    // 暗角只能壓低環境光，不能把照到邊界的手電筒一起吃掉。
    float edgeVisibility = mix(0.5 + vignette * 0.5, 1.0, beam);
    vec3 color = sourceColor * lightAmount * edgeVisibility + grain;
    gl_FragColor = vec4(max(color, 0.0), 1.0);
  }
`;

export class CinematicBackdrop {
  private readonly material: THREE.ShaderMaterial;
  private readonly mesh: THREE.Mesh<THREE.PlaneGeometry, THREE.ShaderMaterial>;
  private currentFrame = 0;
  private targetFrame = 0;
  private transition = 1;
  private elapsed = 0;

  constructor(
    scene: THREE.Scene,
    private readonly camera: THREE.PerspectiveCamera,
    assetUrl: string | null,
    onLoaded: () => void,
  ) {
    const placeholder = new THREE.DataTexture(new Uint8Array([18, 16, 14, 255]), 1, 1);
    placeholder.needsUpdate = true;
    this.material = new THREE.ShaderMaterial({
      uniforms: {
        frames: { value: placeholder },
        currentFrame: { value: 0 },
        targetFrame: { value: 0 },
        transitionMix: { value: 1 },
        flashlightUv: { value: new THREE.Vector2(0.5, 0.5) },
        flashlightStrength: { value: 0 },
        aspect: { value: 1 },
        time: { value: 0 },
      },
      vertexShader: VERTEX_SHADER,
      fragmentShader: FRAGMENT_SHADER,
      depthTest: false,
      depthWrite: false,
      toneMapped: false,
    });
    this.mesh = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), this.material);
    this.mesh.position.set(0, 1.6, -4);
    this.mesh.renderOrder = -100;
    scene.add(this.mesh);
    this.resize(innerWidth, innerHeight);

    if (assetUrl) {
      new THREE.TextureLoader().load(
        assetUrl,
        (texture) => {
          texture.colorSpace = THREE.NoColorSpace;
          texture.minFilter = THREE.LinearFilter;
          texture.magFilter = THREE.LinearFilter;
          texture.generateMipmaps = false;
          this.material.uniforms.frames!.value = texture;
          onLoaded();
        },
        undefined,
        () => {
          // 程序化房間 fallback 會繼續顯示。
        },
      );
    }
  }

  setFrame(frame: number): void {
    const normalized = Math.min(3, Math.max(0, Math.round(frame)));
    if (normalized === this.targetFrame) return;
    if (this.transition < 1) this.currentFrame = this.targetFrame;
    this.targetFrame = normalized;
    this.transition = 0;
    this.material.uniforms.currentFrame!.value = this.currentFrame;
    this.material.uniforms.targetFrame!.value = this.targetFrame;
  }

  update(deltaSeconds: number, direction: THREE.Vector3 | null): void {
    this.elapsed += deltaSeconds;
    this.material.uniforms.time!.value = this.elapsed;
    this.transition = Math.min(1, this.transition + deltaSeconds / 0.14);
    this.material.uniforms.transitionMix!.value = this.transition;
    if (this.transition === 1 && this.currentFrame !== this.targetFrame) {
      this.currentFrame = this.targetFrame;
      this.material.uniforms.currentFrame!.value = this.currentFrame;
    }

    if (!direction) {
      this.material.uniforms.flashlightStrength!.value = 0;
      return;
    }
    const projected = this.camera.position.clone().addScaledVector(direction, 5).project(this.camera);
    // 手機只需小幅轉動就能掃到左右邊界；留 1.5% 避免光心完全跑出畫面。
    this.material.uniforms.flashlightUv!.value.set(
      THREE.MathUtils.clamp(projected.x * 0.72 + 0.5, 0.015, 0.985),
      THREE.MathUtils.clamp(projected.y * 0.72 + 0.5, 0.015, 0.985),
    );
    this.material.uniforms.flashlightStrength!.value = 1;
  }

  resize(width: number, height: number): void {
    const distance = Math.abs(this.mesh.position.z - this.camera.position.z);
    const planeHeight = 2 * Math.tan(THREE.MathUtils.degToRad(this.camera.fov * 0.5)) * distance;
    this.mesh.scale.set(planeHeight * (width / height), planeHeight, 1);
    this.material.uniforms.aspect!.value = width / height;
  }
}
