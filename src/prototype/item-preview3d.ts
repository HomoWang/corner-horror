import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

interface PreviewConfig {
  path: string;
  rotation: [number, number, number];
}

const previewConfigs: Record<string, PreviewConfig> = {
  tape: {
    path: '/assets/models/room407/recording_tape/scene.gltf',
    rotation: [-1.08, 0.36, 0.14],
  },
  smallKey: {
    path: '/assets/models/room407/key/scene.gltf',
    rotation: [-1.12, 0.25, -0.08],
  },
};

export class ItemPreview3D {
  private readonly renderer: THREE.WebGLRenderer;
  private readonly scene = new THREE.Scene();
  private readonly camera = new THREE.PerspectiveCamera(34, 1, 0.01, 20);
  private readonly displayRoot = new THREE.Group();
  private readonly loader = new GLTFLoader();
  private readonly cachedModels = new Map<string, THREE.Object3D>();
  private active = false;
  private loadVersion = 0;
  private lastTime = performance.now();
  private renderWidth = 0;
  private renderHeight = 0;

  constructor(private readonly canvas: HTMLCanvasElement) {
    this.renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: true });
    this.renderer.setClearColor(0x000000, 0);
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.62;
    this.renderer.setPixelRatio(Math.min(devicePixelRatio, 1.8));

    const environmentGenerator = new THREE.PMREMGenerator(this.renderer);
    this.scene.environment = environmentGenerator.fromScene(new RoomEnvironment(), 0.04).texture;
    environmentGenerator.dispose();

    this.camera.position.set(0, 0.08, 3.15);
    this.scene.add(this.displayRoot);
    this.scene.add(new THREE.HemisphereLight(0xd8dde0, 0x241914, 2.7));
    this.scene.add(new THREE.AmbientLight(0xffffff, 0.75));

    const keyLight = new THREE.DirectionalLight(0xffe4ca, 4.2);
    keyLight.position.set(-2.2, 3.1, 3.4);
    this.scene.add(keyLight);

    const rimLight = new THREE.DirectionalLight(0x8aa8b7, 1.9);
    rimLight.position.set(2.8, 1.1, -2.4);
    this.scene.add(rimLight);

    this.canvas.hidden = true;
    requestAnimationFrame(this.render);
  }

  show(item: string): boolean {
    const config = previewConfigs[item];
    this.loadVersion += 1;
    this.clearDisplay();
    if (!config) {
      this.active = false;
      this.canvas.hidden = true;
      return false;
    }

    this.active = true;
    this.canvas.hidden = false;
    this.resize();
    const version = this.loadVersion;
    const cached = this.cachedModels.get(item);
    if (cached) {
      this.mountModel(cached.clone(true), config.rotation);
      return true;
    }

    this.loader.load(
      config.path,
      (gltf) => {
        this.cachedModels.set(item, gltf.scene);
        if (version !== this.loadVersion || !this.active) return;
        this.mountModel(gltf.scene.clone(true), config.rotation);
      },
      undefined,
      (error) => {
        console.warn(`Unable to load item preview: ${config.path}`, error);
        if (version === this.loadVersion) this.canvas.hidden = true;
      },
    );
    return true;
  }

  hide(): void {
    this.loadVersion += 1;
    this.active = false;
    this.canvas.hidden = true;
    this.clearDisplay();
  }

  private mountModel(model: THREE.Object3D, rotation: [number, number, number]): void {
    model.rotation.set(...rotation);
    model.updateMatrixWorld(true);

    const bounds = new THREE.Box3().setFromObject(model);
    const size = bounds.getSize(new THREE.Vector3());
    const largestDimension = Math.max(size.x, size.y, size.z);
    if (largestDimension > 0) model.scale.multiplyScalar(1.85 / largestDimension);
    model.updateMatrixWorld(true);

    const scaledBounds = new THREE.Box3().setFromObject(model);
    const center = scaledBounds.getCenter(new THREE.Vector3());
    model.position.sub(center);
    model.traverse((child) => {
      if (!(child instanceof THREE.Mesh)) return;
      child.castShadow = true;
      child.receiveShadow = true;
    });

    this.clearDisplay();
    this.displayRoot.rotation.set(0, 0, 0);
    this.displayRoot.add(model);
  }

  private clearDisplay(): void {
    this.displayRoot.clear();
  }

  private resize(): void {
    const width = Math.max(1, this.canvas.clientWidth);
    const height = Math.max(1, this.canvas.clientHeight);
    if (width === this.renderWidth && height === this.renderHeight) return;
    this.renderWidth = width;
    this.renderHeight = height;
    this.renderer.setSize(width, height, false);
    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
  }

  private readonly render = (time: number): void => {
    requestAnimationFrame(this.render);
    if (!this.active || this.canvas.hidden) {
      this.lastTime = time;
      return;
    }

    this.resize();
    const delta = Math.min((time - this.lastTime) / 1000, 0.05);
    this.lastTime = time;
    this.displayRoot.rotation.y += delta * 0.34;
    this.renderer.render(this.scene, this.camera);
  };
}
