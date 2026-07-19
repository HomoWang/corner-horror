import * as THREE from 'three';

const OVERLAY_DISTANCE = 3.72;
const DISPLAY_SECONDS = 1.32;

function easeOutBack(value: number): number {
  const c1 = 1.70158;
  const c3 = c1 + 1;
  return 1 + c3 * Math.pow(value - 1, 3) + c1 * Math.pow(value - 1, 2);
}

export class JumpscareOverlay {
  private readonly material: THREE.MeshBasicMaterial;
  private readonly mesh: THREE.Mesh<THREE.PlaneGeometry, THREE.MeshBasicMaterial>;
  private elapsed = DISPLAY_SECONDS;
  private baseWidth = 1;
  private baseHeight = 1;

  constructor(
    scene: THREE.Scene,
    private readonly camera: THREE.PerspectiveCamera,
    assetUrl: string | null,
  ) {
    const placeholder = new THREE.DataTexture(new Uint8Array([0, 0, 0, 255]), 1, 1);
    placeholder.needsUpdate = true;
    this.material = new THREE.MeshBasicMaterial({
      map: placeholder,
      color: 0xffffff,
      transparent: true,
      opacity: 0,
      depthTest: false,
      depthWrite: false,
      toneMapped: false,
    });
    this.mesh = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), this.material);
    this.mesh.position.set(0, 1.6, -OVERLAY_DISTANCE);
    this.mesh.renderOrder = 10_000;
    this.mesh.frustumCulled = false;
    this.mesh.visible = false;
    scene.add(this.mesh);

    if (assetUrl) {
      new THREE.TextureLoader().load(assetUrl, (texture) => {
        texture.colorSpace = THREE.SRGBColorSpace;
        texture.minFilter = THREE.LinearFilter;
        texture.magFilter = THREE.LinearFilter;
        this.material.map = texture;
        this.material.needsUpdate = true;
      });
    }
  }

  trigger(): void {
    this.elapsed = 0;
    this.mesh.visible = true;
    this.material.opacity = 1;
  }

  reset(): void {
    this.elapsed = DISPLAY_SECONDS;
    this.mesh.visible = false;
    this.material.opacity = 0;
    this.material.color.setHex(0xffffff);
    this.mesh.position.set(0, 1.6, -OVERLAY_DISTANCE);
    this.mesh.rotation.z = 0;
  }

  update(deltaSeconds: number): void {
    if (!this.mesh.visible) return;
    this.elapsed = Math.min(DISPLAY_SECONDS, this.elapsed + deltaSeconds);
    const t = this.elapsed / DISPLAY_SECONDS;
    const punchT = Math.min(1, this.elapsed / 0.16);
    const scale = 0.74 + easeOutBack(punchT) * 0.34;
    this.mesh.scale.set(this.baseWidth * scale, this.baseHeight * scale, 1);

    const shake = (1 - t) * 0.035;
    this.mesh.position.x = Math.sin(this.elapsed * 143) * shake;
    this.mesh.position.y = 1.6 + Math.cos(this.elapsed * 119) * shake;
    this.mesh.rotation.z = Math.sin(this.elapsed * 97) * shake * 0.65;

    const flicker = this.elapsed < 0.42 && Math.floor(this.elapsed * 42) % 5 === 2 ? 0.34 : 1;
    const fade = t < 0.72 ? 1 : 1 - THREE.MathUtils.smoothstep(t, 0.72, 1);
    this.material.opacity = flicker * fade;
    const redPulse = Math.max(0, 1 - this.elapsed / 0.24);
    this.material.color.setRGB(1, 1 - redPulse * 0.32, 1 - redPulse * 0.32);

    if (this.elapsed >= DISPLAY_SECONDS) this.reset();
  }

  resize(width: number, height: number): void {
    const planeHeight = 2 * Math.tan(THREE.MathUtils.degToRad(this.camera.fov * 0.5)) * OVERLAY_DISTANCE;
    this.baseWidth = planeHeight * (width / height);
    this.baseHeight = planeHeight;
    if (!this.mesh.visible) this.mesh.scale.set(this.baseWidth, this.baseHeight, 1);
  }
}
