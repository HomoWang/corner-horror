import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

const KEYPAD_MODEL_PATH = '/assets/models/room407/keypad_lock/scene.gltf';

export class KeypadPreview3D {
  private readonly renderer: THREE.WebGLRenderer;
  private readonly scene = new THREE.Scene();
  private readonly camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.01, 20);
  private readonly displayRoot = new THREE.Group();
  private active = false;
  private modelWidth = 1;
  private modelHeight = 1;
  private renderWidth = 0;
  private renderHeight = 0;

  constructor(private readonly canvas: HTMLCanvasElement) {
    this.renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: true });
    this.renderer.setClearColor(0x000000, 0);
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.18;
    this.renderer.setPixelRatio(Math.min(devicePixelRatio, 1.8));

    const environmentGenerator = new THREE.PMREMGenerator(this.renderer);
    this.scene.environment = environmentGenerator.fromScene(new RoomEnvironment(), 0.04).texture;
    environmentGenerator.dispose();

    this.camera.position.set(0, 0, 5);
    this.camera.lookAt(0, 0, 0);
    this.scene.add(this.displayRoot);
    this.scene.add(new THREE.HemisphereLight(0xc8d0d2, 0x171310, 1.8));
    this.scene.add(new THREE.AmbientLight(0xffffff, 0.42));

    const keyLight = new THREE.DirectionalLight(0xffe4ca, 3.1);
    keyLight.position.set(-2.3, 3.2, 4);
    this.scene.add(keyLight);

    const rimLight = new THREE.DirectionalLight(0x7693a0, 1.15);
    rimLight.position.set(2.7, 0.8, -2.1);
    this.scene.add(rimLight);

    new GLTFLoader().load(
      KEYPAD_MODEL_PATH,
      (gltf) => this.mountModel(gltf.scene),
      undefined,
      (error) => console.warn(`Unable to load keypad preview: ${KEYPAD_MODEL_PATH}`, error),
    );
    requestAnimationFrame(this.render);
  }

  show(): void {
    this.active = true;
    this.resize();
  }

  hide(): void {
    this.active = false;
  }

  private mountModel(model: THREE.Object3D): void {
    model.rotation.y = -Math.PI / 2;
    model.updateMatrixWorld(true);

    const bounds = new THREE.Box3().setFromObject(model);
    const size = bounds.getSize(new THREE.Vector3());
    const scale = 2 / Math.max(size.x, size.y);
    model.scale.multiplyScalar(scale);
    model.updateMatrixWorld(true);

    const scaledBounds = new THREE.Box3().setFromObject(model);
    const center = scaledBounds.getCenter(new THREE.Vector3());
    const scaledSize = scaledBounds.getSize(new THREE.Vector3());
    model.position.sub(center);
    model.traverse((child) => {
      if (!(child instanceof THREE.Mesh)) return;
      child.castShadow = true;
      child.receiveShadow = true;
      const materials = Array.isArray(child.material) ? child.material : [child.material];
      for (const material of materials) {
        if (!(material instanceof THREE.MeshStandardMaterial) || !material.map) continue;
        material.map.anisotropy = Math.min(
          8,
          this.renderer.capabilities.getMaxAnisotropy(),
        );
      }
    });

    this.modelWidth = scaledSize.x;
    this.modelHeight = scaledSize.y;
    this.displayRoot.clear();
    this.displayRoot.add(model);
    this.resize(true);
  }

  private resize(force = false): void {
    const width = Math.max(1, this.canvas.clientWidth);
    const height = Math.max(1, this.canvas.clientHeight);
    if (!force && width === this.renderWidth && height === this.renderHeight) return;
    this.renderWidth = width;
    this.renderHeight = height;
    this.renderer.setSize(width, height, false);

    const aspect = width / height;
    const viewHeight = Math.max(this.modelHeight, this.modelWidth / aspect) * 1.12;
    const halfHeight = viewHeight / 2;
    const halfWidth = halfHeight * aspect;
    this.camera.left = -halfWidth;
    this.camera.right = halfWidth;
    this.camera.top = halfHeight;
    this.camera.bottom = -halfHeight;
    this.camera.updateProjectionMatrix();
  }

  private readonly render = (): void => {
    requestAnimationFrame(this.render);
    if (!this.active) return;
    this.resize();
    this.renderer.render(this.scene, this.camera);
  };
}
