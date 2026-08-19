import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

export type RoomObjectId =
  | 'wardrobe'
  | 'wardrobeLeft'
  | 'wardrobeMiddle'
  | 'wardrobeRight'
  | 'receipt'
  | 'table'
  | 'pencil'
  | 'safe'
  | 'drawer'
  | 'tape'
  | 'oldBattery'
  | 'smallKey'
  | 'recorder'
  | 'door';

type CollectibleRoomObjectId =
  | 'receipt'
  | 'pencil'
  | 'tape'
  | 'oldBattery'
  | 'smallKey';

type WardrobeSection = 'left' | 'middle' | 'right';

interface VectorInput {
  x: number;
  y: number;
}

interface CollisionRect {
  minX: number;
  maxX: number;
  minZ: number;
  maxZ: number;
}

const ROOM_HALF_WIDTH = 4.4;
const ROOM_HALF_DEPTH = 4.6;
const ROOM_HEIGHT = 3.45;
const EYE_HEIGHT = 1.62;
const PLAYER_RADIUS = 0.3;
const MOVE_SPEED = 1.72;
const TURN_SPEED = 1.75;
const PITCH_SPEED = 1.45;

function standardMaterial(
  color: number,
  roughness = 0.82,
  metalness = 0.04,
): THREE.MeshStandardMaterial {
  return new THREE.MeshStandardMaterial({ color, roughness, metalness });
}

function box(
  size: [number, number, number],
  colorOrMaterial: number | THREE.Material,
  position: [number, number, number],
  objectId?: RoomObjectId,
): THREE.Mesh {
  const material =
    typeof colorOrMaterial === 'number' ? standardMaterial(colorOrMaterial) : colorOrMaterial;
  const radius = Math.min(0.035, Math.min(...size) * 0.22);
  const mesh = new THREE.Mesh(new RoundedBoxGeometry(...size, 2, radius), material);
  mesh.position.set(...position);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  if (objectId) mesh.userData.objectId = objectId;
  return mesh;
}

function plane(
  size: [number, number],
  material: THREE.Material,
  position: [number, number, number],
): THREE.Mesh {
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(...size), material);
  mesh.position.set(...position);
  mesh.receiveShadow = true;
  return mesh;
}

function interactionProxy(
  size: [number, number, number],
  position: [number, number, number],
  objectId: RoomObjectId,
): THREE.Mesh {
  const material = new THREE.MeshBasicMaterial({
    transparent: true,
    opacity: 0,
    depthWrite: false,
    colorWrite: false,
  });
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(...size), material);
  mesh.position.set(...position);
  mesh.userData.objectId = objectId;
  return mesh;
}

function addObjectId(root: THREE.Object3D, objectId: RoomObjectId): void {
  root.traverse((child) => {
    child.userData.objectId = objectId;
  });
}

function seededRandom(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state * 1664525 + 1013904223) >>> 0;
    return state / 0x100000000;
  };
}

function createFloorTexture(): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 1024;
  canvas.height = 1024;
  const context = canvas.getContext('2d')!;
  const random = seededRandom(407);

  context.fillStyle = '#3a302b';
  context.fillRect(0, 0, canvas.width, canvas.height);

  for (let y = 0; y < canvas.height; y += 94) {
    const shade = 42 + Math.floor(random() * 16);
    context.fillStyle = `rgb(${shade + 12}, ${shade + 4}, ${shade})`;
    context.fillRect(0, y + 3, canvas.width, 88);
    context.fillStyle = 'rgba(226, 196, 156, 0.035)';
    context.fillRect(0, y + 5, canvas.width, 2);
  }

  context.strokeStyle = 'rgba(18, 14, 13, 0.72)';
  context.lineWidth = 5;
  for (let y = 0; y <= canvas.height; y += 94) {
    context.beginPath();
    context.moveTo(0, y);
    context.lineTo(canvas.width, y);
    context.stroke();
  }

  context.strokeStyle = 'rgba(18, 14, 13, 0.5)';
  context.lineWidth = 3;
  for (let row = 0; row < 12; row += 1) {
    const offset = row % 2 === 0 ? 0 : 180;
    for (let x = offset; x < canvas.width; x += 360) {
      context.beginPath();
      context.moveTo(x, row * 94);
      context.lineTo(x, Math.min(canvas.height, (row + 1) * 94));
      context.stroke();
    }
  }

  for (let index = 0; index < 300; index += 1) {
    const alpha = 0.025 + random() * 0.06;
    const radius = 2 + random() * 18;
    context.fillStyle = `rgba(4, 3, 3, ${alpha})`;
    context.beginPath();
    context.ellipse(
      random() * canvas.width,
      random() * canvas.height,
      radius * 2.5,
      radius,
      random() * Math.PI,
      0,
      Math.PI * 2,
    );
    context.fill();
  }

  const texture = new THREE.CanvasTexture(canvas);
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.repeat.set(2.7, 3.2);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

function createWallTexture(seed: number): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 1024;
  canvas.height = 1024;
  const context = canvas.getContext('2d')!;
  const random = seededRandom(seed);

  context.fillStyle = '#62645d';
  context.fillRect(0, 0, canvas.width, canvas.height);

  for (let index = 0; index < 8000; index += 1) {
    const value = 70 + Math.floor(random() * 60);
    const alpha = 0.025 + random() * 0.06;
    context.fillStyle = `rgba(${value}, ${value + 2}, ${value - 3}, ${alpha})`;
    const size = 1 + random() * 5;
    context.fillRect(random() * canvas.width, random() * canvas.height, size, size);
  }

  for (let index = 0; index < 36; index += 1) {
    const x = random() * canvas.width;
    const y = random() * canvas.height;
    const radius = 26 + random() * 120;
    const gradient = context.createRadialGradient(x, y, 1, x, y, radius);
    gradient.addColorStop(0, `rgba(25, 28, 25, ${0.06 + random() * 0.14})`);
    gradient.addColorStop(1, 'rgba(25, 28, 25, 0)');
    context.fillStyle = gradient;
    context.fillRect(x - radius, y - radius, radius * 2, radius * 2);
  }

  context.strokeStyle = 'rgba(38, 39, 35, 0.16)';
  context.lineWidth = 3;
  for (let index = 0; index < 24; index += 1) {
    const x = random() * canvas.width;
    const y = random() * canvas.height * 0.75;
    context.beginPath();
    context.moveTo(x, y);
    context.bezierCurveTo(
      x - 18 + random() * 36,
      y + 50,
      x - 24 + random() * 48,
      y + 120,
      x - 12 + random() * 24,
      y + 220 + random() * 180,
    );
    context.stroke();
  }

  const texture = new THREE.CanvasTexture(canvas);
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.repeat.set(1.35, 1);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

function createLabelTexture(text: string): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 128;
  const context = canvas.getContext('2d')!;
  context.fillStyle = '#1b1713';
  context.fillRect(0, 0, canvas.width, canvas.height);
  context.strokeStyle = '#88775f';
  context.lineWidth = 8;
  context.strokeRect(8, 8, canvas.width - 16, canvas.height - 16);
  context.fillStyle = '#a99574';
  context.font = '700 64px Georgia, serif';
  context.textAlign = 'center';
  context.textBaseline = 'middle';
  context.fillText(text, canvas.width / 2, canvas.height / 2 + 3);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

function createDrapedBlanket(material: THREE.Material): THREE.Mesh {
  const geometry = new THREE.PlaneGeometry(2.14, 3.3, 24, 34);
  const positions = geometry.getAttribute('position');
  for (let index = 0; index < positions.count; index += 1) {
    const x = positions.getX(index);
    const y = positions.getY(index);
    const edgeDrop = Math.max(0, Math.abs(x) - 0.86) * 0.22;
    const folds = Math.sin(y * 8.2 + x * 2.4) * 0.025 + Math.sin(x * 13.5) * 0.012;
    positions.setZ(index, folds - edgeDrop);
  }
  geometry.computeVertexNormals();
  const blanket = new THREE.Mesh(geometry, material);
  blanket.rotation.x = -Math.PI / 2;
  blanket.rotation.z = -0.018;
  blanket.position.set(3.28, 0.91, 2.55);
  blanket.castShadow = true;
  blanket.receiveShadow = true;
  return blanket;
}

export class PrototypeRoom3D {
  private readonly renderer: THREE.WebGLRenderer;
  private readonly scene = new THREE.Scene();
  private readonly camera: THREE.PerspectiveCamera;
  private readonly gltfLoader = new GLTFLoader();
  private readonly raycaster = new THREE.Raycaster();
  private readonly interactables: THREE.Object3D[] = [];
  private readonly colliders: CollisionRect[] = [];
  private readonly flashlight: THREE.SpotLight;
  private readonly flashlightTarget = new THREE.Object3D();
  private readonly collectibleObjects = new Map<CollectibleRoomObjectId, THREE.Object3D>();
  private wardrobeDoors: Array<{
    section: WardrobeSection;
    object: THREE.Object3D;
    closedRotationY: number;
    openRotationY: number;
    progress: number;
    target: number;
  }> = [];
  private wardrobeContents: THREE.Group | null = null;
  private safeGroup: THREE.Group | null = null;
  private safeDoor: THREE.Group | null = null;
  private safeDoorProgress = 0;
  private safeDoorTarget = 0;
  private deskDrawer: THREE.Object3D | null = null;
  private readonly drawerClosedPosition = new THREE.Vector3();
  private readonly drawerOpenOffset = new THREE.Vector3(0.82, 0, 0);
  private drawerProgress = 0;
  private drawerTarget = 0;
  private drawerContentsRevealed = false;
  private drawerContentsUseWorldPlacement = false;
  private recorderTape: THREE.Group | null = null;
  private recorderTapePhoto: THREE.Mesh | null = null;
  private readonly recorderTapeEnd = new THREE.Vector3(-3.848, 1.232, -0.018);
  private recorderTapeFinalRotationY = 0;
  private recorderTapeInserted = false;
  private recorderCover: THREE.Object3D | null = null;
  private readonly recorderCoverOpenQuaternion = new THREE.Quaternion();
  private readonly recorderCoverClosedQuaternion = new THREE.Quaternion();
  private deskSurface: THREE.Object3D | null = null;
  private pencilCollectible: THREE.Group | null = null;
  private yaw = 0;
  private pitch = 0;
  private targetObject: RoomObjectId | null = null;

  constructor(canvas: HTMLCanvasElement) {
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
    this.renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.62;
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;

    const environmentGenerator = new THREE.PMREMGenerator(this.renderer);
    this.scene.environment = environmentGenerator.fromScene(
      new RoomEnvironment(),
      0.035,
    ).texture;
    environmentGenerator.dispose();

    this.scene.background = new THREE.Color(0x111412);
    this.camera = new THREE.PerspectiveCamera(68, innerWidth / innerHeight, 0.05, 32);
    this.camera.position.set(0, EYE_HEIGHT, 3.72);
    this.camera.rotation.order = 'YXZ';

    this.createRoomShell();
    this.createFurniture();

    this.scene.add(new THREE.HemisphereLight(0xb9c4b7, 0x251c18, 1.12));
    this.scene.add(new THREE.AmbientLight(0xcac5b9, 0.54));

    const ceilingLight = new THREE.PointLight(0xc9d7ca, 28, 11.5, 1.65);
    ceilingLight.position.set(0.35, 3.08, -0.8);
    ceilingLight.castShadow = true;
    ceilingLight.shadow.mapSize.set(1024, 1024);
    ceilingLight.shadow.radius = 4;
    ceilingLight.shadow.bias = -0.00025;
    this.scene.add(ceilingLight);

    this.flashlight = new THREE.SpotLight(0xffe7c3, 142, 17, 0.34, 0.76, 1.3);
    this.flashlight.castShadow = true;
    this.flashlight.shadow.mapSize.set(1024, 1024);
    this.scene.add(this.flashlight);
    this.scene.add(this.flashlightTarget);
    this.flashlight.target = this.flashlightTarget;

    this.resize();
  }

  resize(): void {
    this.camera.aspect = innerWidth / innerHeight;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(innerWidth, innerHeight, false);
  }

  update(
    delta: number,
    time: number,
    look: VectorInput,
    move: VectorInput,
    controlsEnabled: boolean,
  ): number {
    this.animateFurniture(delta);
    const previousX = this.camera.position.x;
    const previousZ = this.camera.position.z;

    if (controlsEnabled) {
      this.yaw -= look.x * delta * TURN_SPEED;
      this.pitch = THREE.MathUtils.clamp(
        this.pitch + look.y * delta * PITCH_SPEED,
        -Math.PI * 0.47,
        Math.PI * 0.47,
      );

      this.camera.rotation.set(this.pitch, this.yaw, 0);
      const forward = new THREE.Vector3();
      this.camera.getWorldDirection(forward);
      forward.y = 0;
      forward.normalize();
      const right = new THREE.Vector3().crossVectors(forward, this.camera.up).normalize();
      const motion = forward
        .multiplyScalar(move.y)
        .add(right.multiplyScalar(move.x));
      if (motion.lengthSq() > 1) motion.normalize();

      const nextX = THREE.MathUtils.clamp(
        this.camera.position.x + motion.x * delta * MOVE_SPEED,
        -ROOM_HALF_WIDTH + PLAYER_RADIUS,
        ROOM_HALF_WIDTH - PLAYER_RADIUS,
      );
      if (!this.isBlocked(nextX, this.camera.position.z)) {
        this.camera.position.x = nextX;
      }

      const nextZ = THREE.MathUtils.clamp(
        this.camera.position.z + motion.z * delta * MOVE_SPEED,
        -ROOM_HALF_DEPTH + PLAYER_RADIUS,
        ROOM_HALF_DEPTH - PLAYER_RADIUS,
      );
      if (!this.isBlocked(this.camera.position.x, nextZ)) {
        this.camera.position.z = nextZ;
      }
    }

    const walking = controlsEnabled ? Math.min(1, Math.hypot(move.x, move.y)) : 0;
    this.camera.position.y =
      EYE_HEIGHT + (walking > 0.03 ? Math.sin(time * 10.8) * 0.052 * walking : 0);
    this.camera.rotation.z =
      walking > 0.03 ? Math.sin(time * 5.4) * 0.006 * walking : 0;

    const direction = new THREE.Vector3();
    this.camera.getWorldDirection(direction);
    this.flashlight.position.copy(this.camera.position);
    this.flashlightTarget.position.copy(this.camera.position).addScaledVector(direction, 5);

    this.raycaster.setFromCamera(new THREE.Vector2(0, 0), this.camera);
    const hit = this.raycaster
      .intersectObjects(this.interactables, true)
      .find(
        (intersection) =>
          this.isWorldVisible(intersection.object) &&
          typeof intersection.object.userData.objectId === 'string',
      );
    this.targetObject =
      hit && hit.distance <= 3.35
        ? (hit.object.userData.objectId as RoomObjectId | undefined) ?? null
        : null;

    this.renderer.render(this.scene, this.camera);
    return Math.hypot(
      this.camera.position.x - previousX,
      this.camera.position.z - previousZ,
    );
  }

  getTargetObject(): RoomObjectId | null {
    return this.targetObject;
  }

  openWardrobe(section: WardrobeSection = 'left'): boolean {
    const door = this.wardrobeDoors.find((entry) => entry.section === section);
    if (!door || door.target === 1) return false;
    door.target = 1;
    if (this.wardrobeContents) this.wardrobeContents.visible = true;
    if (section === 'right' && this.safeGroup) this.safeGroup.visible = true;
    if (section === 'left') {
      const receipt = this.collectibleObjects.get('receipt');
      if (receipt) receipt.visible = true;
    }
    return true;
  }

  openSafe(): boolean {
    if (this.safeDoorTarget === 1) return false;
    this.safeDoorTarget = 1;
    return true;
  }

  openDrawer(): boolean {
    if (this.drawerTarget === 1) return false;
    this.drawerTarget = 1;
    return true;
  }

  hasTapeInRecorder(): boolean {
    return this.recorderTapeInserted;
  }

  insertTapeIntoRecorder(): boolean {
    if (this.recorderTapeInserted) return false;
    this.recorderTapeInserted = true;
    if (this.recorderTape) {
      this.recorderTape.visible = true;
      this.recorderTape.position.copy(this.recorderTapeEnd);
      this.recorderTape.rotation.set(0, this.recorderTapeFinalRotationY, 0);
    }
    if (this.recorderCover) {
      this.recorderCover.quaternion.copy(this.recorderCoverClosedQuaternion);
    }
    return true;
  }

  collectObject(objectId: CollectibleRoomObjectId): void {
    const object = this.collectibleObjects.get(objectId);
    if (!object) return;
    object.visible = false;
    const interactableIndex = this.interactables.indexOf(object);
    if (interactableIndex !== -1) this.interactables.splice(interactableIndex, 1);
  }

  private animateFurniture(delta: number): void {
    if (this.wardrobeDoors.length > 0) {
      for (const door of this.wardrobeDoors) {
        door.progress = THREE.MathUtils.damp(
          door.progress,
          door.target,
          5.8,
          delta,
        );
        const eased = THREE.MathUtils.smoothstep(door.progress, 0, 1);
        door.object.rotation.y = THREE.MathUtils.lerp(
          door.closedRotationY,
          door.openRotationY,
          eased,
        );
      }
    }

    this.safeDoorProgress = THREE.MathUtils.damp(
      this.safeDoorProgress,
      this.safeDoorTarget,
      5.2,
      delta,
    );
    if (this.safeDoor) {
      this.safeDoor.rotation.y = THREE.MathUtils.lerp(
        0,
        -1.42,
        THREE.MathUtils.smoothstep(this.safeDoorProgress, 0, 1),
      );
      if (this.safeDoorProgress > 0.24) {
        const key = this.collectibleObjects.get('smallKey');
        if (key) key.visible = true;
      }
    }

    this.drawerProgress = THREE.MathUtils.damp(
      this.drawerProgress,
      this.drawerTarget,
      5.2,
      delta,
    );
    if (this.deskDrawer) {
      const eased = THREE.MathUtils.smoothstep(this.drawerProgress, 0, 1);
      this.deskDrawer.position
        .copy(this.drawerClosedPosition)
        .addScaledVector(this.drawerOpenOffset, eased);
      if (!this.drawerContentsRevealed && this.drawerProgress > 0.22) {
        this.drawerContentsRevealed = true;
        for (const item of ['tape', 'oldBattery'] as const) {
          const object = this.collectibleObjects.get(item);
          if (object) object.visible = true;
        }
      }
      this.positionWorldDrawerContents();
    }

  }

  private isBlocked(x: number, z: number): boolean {
    return this.colliders.some(
      (collider) =>
        x > collider.minX - PLAYER_RADIUS &&
        x < collider.maxX + PLAYER_RADIUS &&
        z > collider.minZ - PLAYER_RADIUS &&
        z < collider.maxZ + PLAYER_RADIUS,
    );
  }

  private isWorldVisible(object: THREE.Object3D): boolean {
    let current: THREE.Object3D | null = object;
    while (current) {
      if (!current.visible) return false;
      current = current.parent;
    }
    return true;
  }

  private getRenderableBounds(object: THREE.Object3D): THREE.Box3 {
    object.updateWorldMatrix(true, true);
    const bounds = new THREE.Box3();
    object.traverse((child) => {
      if (!(child instanceof THREE.Mesh) || !this.isWorldVisible(child)) return;
      const materials = Array.isArray(child.material) ? child.material : [child.material];
      if (materials.every((material) => material.colorWrite === false)) return;
      child.geometry.computeBoundingBox();
      if (!child.geometry.boundingBox) return;
      bounds.union(child.geometry.boundingBox.clone().applyMatrix4(child.matrixWorld));
    });
    return bounds;
  }

  private positionWorldDrawerContents(): void {
    if (!this.drawerContentsUseWorldPlacement || !this.deskDrawer) return;
    const drawerBounds = this.getRenderableBounds(this.deskDrawer);
    if (drawerBounds.isEmpty()) return;

    const center = drawerBounds.getCenter(new THREE.Vector3());
    const drawerHeight = drawerBounds.max.y - drawerBounds.min.y;
    const fallbackSurfaceY = drawerBounds.min.y + Math.min(0.108, drawerHeight * 0.42);
    const layouts: Array<
      [CollectibleRoomObjectId, number, number, number]
    > = [
      ['tape', 0, -0.24, 0.002],
      ['oldBattery', 0, 0, 0.001],
    ];

    for (const [itemId, offsetX, offsetZ, lift] of layouts) {
      const item = this.collectibleObjects.get(itemId);
      if (!item || !item.visible) continue;

      const targetX = center.x + offsetX;
      const targetZ = center.z + offsetZ;
      item.position.set(targetX, fallbackSurfaceY, targetZ);
      item.updateWorldMatrix(true, true);
      const itemBounds = this.getRenderableBounds(item);
      if (itemBounds.isEmpty()) continue;
      const itemCenter = itemBounds.getCenter(new THREE.Vector3());
      item.position.x += targetX - itemCenter.x;
      item.position.z += targetZ - itemCenter.z;
      item.updateWorldMatrix(true, true);

      const alignedBounds = this.getRenderableBounds(item);
      const surfaceRay = new THREE.Raycaster(
        new THREE.Vector3(targetX, drawerBounds.max.y + 0.5, targetZ),
        new THREE.Vector3(0, -1, 0),
        0,
        drawerHeight + 1,
      );
      const surfaceHit = surfaceRay
        .intersectObject(this.deskDrawer, true)
        .find(({ object }) => {
          if (!(object instanceof THREE.Mesh) || !this.isWorldVisible(object)) return false;
          const materials = Array.isArray(object.material) ? object.material : [object.material];
          return materials.some((material) => material.colorWrite !== false);
        });
      const surfaceY = surfaceHit?.point.y ?? fallbackSurfaceY;
      item.position.y += surfaceY + lift - alignedBounds.min.y;
    }
  }

  private placePencilOnDesk(desk: THREE.Object3D): void {
    const pencil = this.pencilCollectible;
    if (!pencil) return;

    desk.updateWorldMatrix(true, true);
    const surfaceRay = new THREE.Raycaster(
      new THREE.Vector3(pencil.position.x, 4, pencil.position.z),
      new THREE.Vector3(0, -1, 0),
      0,
      8,
    );
    const hit = surfaceRay
      .intersectObject(desk, true)
      .find(({ object }) => object instanceof THREE.Mesh && object.visible);
    if (hit) pencil.position.y = hit.point.y + 0.009;
  }

  private loadTexture(path: string, repeatX: number, repeatY: number): THREE.Texture {
    const texture = new THREE.TextureLoader().load(path);
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.wrapS = THREE.RepeatWrapping;
    texture.wrapT = THREE.RepeatWrapping;
    texture.repeat.set(repeatX, repeatY);
    texture.anisotropy = Math.min(8, this.renderer.capabilities.getMaxAnisotropy());
    return texture;
  }

  private loadModel(
    path: string,
    position: [number, number, number],
    rotationY: number,
    targetHeight: number,
    objectId?: RoomObjectId,
    onLoaded?: (model: THREE.Object3D) => void,
    scaleMultiplier: [number, number, number] = [1, 1, 1],
  ): void {
    this.gltfLoader.load(
      path,
      (gltf) => {
        const model = gltf.scene;
        model.rotation.y = rotationY;
        model.updateMatrixWorld(true);

        const initialBounds = new THREE.Box3().setFromObject(model);
        const initialSize = initialBounds.getSize(new THREE.Vector3());
        if (initialSize.y > 0) model.scale.setScalar(targetHeight / initialSize.y);
        model.scale.multiply(new THREE.Vector3(...scaleMultiplier));
        model.updateMatrixWorld(true);

        const scaledBounds = new THREE.Box3().setFromObject(model);
        const scaledCenter = scaledBounds.getCenter(new THREE.Vector3());
        model.position.x += position[0] - scaledCenter.x;
        model.position.y += position[1] - scaledBounds.min.y;
        model.position.z += position[2] - scaledCenter.z;

        model.traverse((child) => {
          if (!(child instanceof THREE.Mesh)) return;
          child.castShadow = true;
          child.receiveShadow = true;
          const materials = Array.isArray(child.material) ? child.material : [child.material];
          for (const material of materials) {
            if (!(material instanceof THREE.MeshStandardMaterial)) continue;
            if (material.map) {
              material.map.anisotropy = Math.min(
                8,
                this.renderer.capabilities.getMaxAnisotropy(),
              );
            }
          }
        });

        if (objectId) {
          addObjectId(model, objectId);
          this.interactables.push(model);
        }
        this.scene.add(model);
        model.updateMatrixWorld(true);
        onLoaded?.(model);
      },
      undefined,
      (error) => console.warn(`Unable to load model: ${path}`, error),
    );
  }

  private loadModelInto(
    parent: THREE.Object3D,
    path: string,
    rotationY: number,
    targetHeight: number,
    onLoaded?: (model: THREE.Object3D) => void,
    scaleMultiplier: [number, number, number] = [1, 1, 1],
    fitMode: 'height' | 'largest' = 'height',
  ): void {
    this.gltfLoader.load(
      path,
      (gltf) => {
        const model = gltf.scene;
        model.rotation.y = rotationY;
        model.updateMatrixWorld(true);

        const initialBounds = new THREE.Box3().setFromObject(model);
        const initialSize = initialBounds.getSize(new THREE.Vector3());
        const referenceSize =
          fitMode === 'largest'
            ? Math.max(initialSize.x, initialSize.y, initialSize.z)
            : initialSize.y;
        if (referenceSize > 0) model.scale.setScalar(targetHeight / referenceSize);
        model.scale.multiply(new THREE.Vector3(...scaleMultiplier));
        model.updateMatrixWorld(true);

        const scaledBounds = new THREE.Box3().setFromObject(model);
        const scaledCenter = scaledBounds.getCenter(new THREE.Vector3());
        model.position.set(-scaledCenter.x, -scaledBounds.min.y, -scaledCenter.z);
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
        parent.add(model);
        onLoaded?.(model);
      },
      undefined,
      (error) => console.warn(`Unable to load model into group: ${path}`, error),
    );
  }

  private loadCassettePhotoInto(parent: THREE.Object3D): void {
    const texture = new THREE.TextureLoader().load(
      '/assets/room407/photos/cassette-slot-fitted.png',
    );
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.anisotropy = Math.min(8, this.renderer.capabilities.getMaxAnisotropy());

    const material = new THREE.MeshBasicMaterial({
      map: texture,
      transparent: true,
      alphaTest: 0.04,
      depthTest: true,
      depthWrite: false,
      side: THREE.DoubleSide,
      toneMapped: false,
    });
    const photo = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), material);
    photo.rotation.x = -Math.PI / 2;
    photo.position.y = 0.002;
    photo.scale.set(0.158, 0.102, 1);
    photo.renderOrder = 8;
    parent.add(photo);
    this.recorderTapePhoto = photo;
  }

  private styleRaincoat(model: THREE.Object3D): void {
    model.traverse((child) => {
      if (!(child instanceof THREE.Mesh)) return;
      const source = Array.isArray(child.material) ? child.material : [child.material];
      const styled = source.map((material) => {
        if (!(material instanceof THREE.MeshStandardMaterial)) return material;
        const weathered = material.clone();
        weathered.color.set(0x626762);
        weathered.metalness = 0;
        weathered.roughness = 0.94;
        if (weathered instanceof THREE.MeshPhysicalMaterial) {
          weathered.clearcoat = 0.06;
          weathered.clearcoatRoughness = 0.76;
        }
        weathered.onBeforeCompile = (shader) => {
          shader.fragmentShader = shader.fragmentShader.replace(
            '#include <map_fragment>',
            `#include <map_fragment>
#ifdef USE_MAP
  float coatGray = dot(diffuseColor.rgb, vec3(0.2126, 0.7152, 0.0722));
  diffuseColor.rgb = mix(diffuseColor.rgb, vec3(coatGray), 0.88);
  diffuseColor.rgb *= vec3(0.58, 0.61, 0.59);

  float hemDamp = 1.0 - smoothstep(0.03, 0.25, abs(vMapUv.y - 0.13));
  float pocketStain = 1.0 - smoothstep(0.035, 0.19, distance(vMapUv, vec2(0.27, 0.53)));
  float shoulderStain = 1.0 - smoothstep(0.025, 0.16, distance(vMapUv, vec2(0.72, 0.82)));
  float streaks = pow(max(0.0, sin(vMapUv.x * 79.0 + sin(vMapUv.y * 18.0))), 18.0);
  streaks *= smoothstep(0.28, 0.86, vMapUv.y) * 0.28;
  float dampMask = clamp(hemDamp * 0.43 + pocketStain * 0.36 + shoulderStain * 0.24 + streaks, 0.0, 0.62);
  diffuseColor.rgb *= 1.0 - dampMask;

  float wornEdge = pow(abs(sin(vMapUv.x * 31.0) * sin(vMapUv.y * 23.0)), 11.0);
  diffuseColor.rgb += vec3(wornEdge * 0.035);
#endif`,
          );
        };
        weathered.customProgramCacheKey = () => 'room407-weathered-raincoat-v1';
        weathered.needsUpdate = true;
        return weathered;
      });
      child.material = Array.isArray(child.material) ? styled : styled[0];
    });
  }

  private styleShirt(model: THREE.Object3D): void {
    model.traverse((child) => {
      if (!(child instanceof THREE.Mesh)) return;
      const source = Array.isArray(child.material) ? child.material : [child.material];
      const styled = source.map((material) => {
        const map = 'map' in material && material.map instanceof THREE.Texture ? material.map : null;
        return new THREE.MeshStandardMaterial({
          color: 0xb1ada5,
          map,
          roughness: 0.96,
          metalness: 0,
          side: THREE.DoubleSide,
        });
      });
      child.material = Array.isArray(child.material) ? styled : styled[0];
    });
  }

  private styleDoor(model: THREE.Object3D): void {
    model.traverse((child) => {
      if (!(child instanceof THREE.Mesh)) return;
      const source = Array.isArray(child.material) ? child.material : [child.material];
      const styled = source.map((material) => {
        if (!(material instanceof THREE.MeshStandardMaterial)) return material;
        const agedWood = material.clone();
        agedWood.color.multiply(new THREE.Color(0x594138));
        agedWood.roughness = 0.88;
        agedWood.metalness = Math.min(agedWood.metalness, 0.08);
        agedWood.needsUpdate = true;
        return agedWood;
      });
      child.material = Array.isArray(child.material) ? styled : styled[0];
    });
  }

  private lowerGarmentSleeves(model: THREE.Object3D, maximumAngle: number): void {
    model.updateMatrixWorld(true);
    const bounds = new THREE.Box3().setFromObject(model);
    const size = bounds.getSize(new THREE.Vector3());
    const center = bounds.getCenter(new THREE.Vector3());
    if (size.x <= 0 || size.y <= 0) return;

    const shoulderY = bounds.max.y - size.y * 0.2;
    const shoulderOffset = size.x * 0.18;
    const blendStart = size.x * 0.18;
    const blendEnd = size.x * 0.34;
    const point = new THREE.Vector3();
    const inverseWorld = new THREE.Matrix4();

    model.traverse((child) => {
      if (!(child instanceof THREE.Mesh)) return;
      const position = child.geometry.getAttribute('position');
      if (!position) return;
      inverseWorld.copy(child.matrixWorld).invert();

      for (let index = 0; index < position.count; index += 1) {
        point.set(position.getX(index), position.getY(index), position.getZ(index));
        point.applyMatrix4(child.matrixWorld);
        const relativeX = point.x - center.x;
        const absoluteX = Math.abs(relativeX);
        if (absoluteX <= blendStart) continue;

        const side = relativeX < 0 ? -1 : 1;
        const weight = THREE.MathUtils.smoothstep(absoluteX, blendStart, blendEnd);
        const angle = -side * maximumAngle * weight;
        const pivotX = center.x + side * shoulderOffset;
        const dx = point.x - pivotX;
        const dy = point.y - shoulderY;
        const cosine = Math.cos(angle);
        const sine = Math.sin(angle);
        point.x = pivotX + dx * cosine - dy * sine;
        point.y = shoulderY + dx * sine + dy * cosine;
        point.applyMatrix4(inverseWorld);
        position.setXYZ(index, point.x, point.y, point.z);
      }

      position.needsUpdate = true;
      child.geometry.computeVertexNormals();
      child.geometry.computeBoundingBox();
      child.geometry.computeBoundingSphere();
    });
  }

  private createRoomShell(): void {
    const frontWallTexture = this.loadTexture('/assets/materials/wall-plaster.png', 1.35, 1);
    const sideWallTexture = this.loadTexture('/assets/materials/wall-plaster.png', 1.65, 1);
    const ceilingTexture = this.loadTexture('/assets/materials/wall-plaster.png', 1.5, 1.5);
    const floorTexture = this.loadTexture('/assets/materials/floor-wood.png', 2.35, 2.8);
    const frontWallMaterial = new THREE.MeshStandardMaterial({
      color: 0xb2b6ad,
      roughness: 1,
      map: frontWallTexture,
      bumpMap: frontWallTexture,
      bumpScale: 0.035,
    });
    const sideWallMaterial = new THREE.MeshStandardMaterial({
      color: 0xa0a69e,
      roughness: 1,
      map: sideWallTexture,
      bumpMap: sideWallTexture,
      bumpScale: 0.035,
    });
    const ceilingMaterial = new THREE.MeshStandardMaterial({
      color: 0x666a65,
      roughness: 1,
      map: ceilingTexture,
      bumpMap: ceilingTexture,
      bumpScale: 0.025,
    });
    const floorMaterial = new THREE.MeshStandardMaterial({
      color: 0xb9a898,
      roughness: 0.88,
      map: floorTexture,
      bumpMap: floorTexture,
      bumpScale: 0.045,
    });

    const floor = new THREE.Mesh(
      new THREE.PlaneGeometry(ROOM_HALF_WIDTH * 2, ROOM_HALF_DEPTH * 2),
      floorMaterial,
    );
    floor.rotation.x = -Math.PI / 2;
    floor.receiveShadow = true;
    this.scene.add(floor);

    const ceiling = new THREE.Mesh(
      new THREE.PlaneGeometry(ROOM_HALF_WIDTH * 2, ROOM_HALF_DEPTH * 2),
      ceilingMaterial,
    );
    ceiling.position.y = ROOM_HEIGHT;
    ceiling.rotation.x = Math.PI / 2;
    ceiling.receiveShadow = true;
    this.scene.add(ceiling);

    const front = new THREE.Mesh(
      new THREE.PlaneGeometry(ROOM_HALF_WIDTH * 2, ROOM_HEIGHT),
      frontWallMaterial,
    );
    front.position.set(0, ROOM_HEIGHT / 2, -ROOM_HALF_DEPTH);
    front.receiveShadow = true;
    this.scene.add(front);

    const back = front.clone();
    back.position.z = ROOM_HALF_DEPTH;
    back.rotation.y = Math.PI;
    this.scene.add(back);

    const left = new THREE.Mesh(
      new THREE.PlaneGeometry(ROOM_HALF_DEPTH * 2, ROOM_HEIGHT),
      sideWallMaterial,
    );
    left.position.set(-ROOM_HALF_WIDTH, ROOM_HEIGHT / 2, 0);
    left.rotation.y = Math.PI / 2;
    left.receiveShadow = true;
    this.scene.add(left);

    const rightWall = left.clone();
    rightWall.position.x = ROOM_HALF_WIDTH;
    rightWall.rotation.y = -Math.PI / 2;
    this.scene.add(rightWall);

    const baseboardMaterial = standardMaterial(0x3b302a);
    this.scene.add(
      box(
        [ROOM_HALF_WIDTH * 2, 0.12, 0.1],
        0x302925,
        [0, 0.12, -ROOM_HALF_DEPTH + 0.06],
      ),
    );
    this.scene.add(
      box(
        [ROOM_HALF_WIDTH * 2, 0.12, 0.1],
        0x302925,
        [0, 0.12, ROOM_HALF_DEPTH - 0.06],
      ),
    );
    const leftBaseboard = new THREE.Mesh(
      new THREE.BoxGeometry(0.1, 0.12, ROOM_HALF_DEPTH * 2),
      baseboardMaterial,
    );
    leftBaseboard.position.set(-ROOM_HALF_WIDTH + 0.06, 0.12, 0);
    this.scene.add(leftBaseboard);
    const rightBaseboard = leftBaseboard.clone();
    rightBaseboard.position.x = ROOM_HALF_WIDTH - 0.06;
    this.scene.add(rightBaseboard);

    const fixtureMaterial = new THREE.MeshBasicMaterial({
      color: 0x303330,
    });
    const ceilingFixture = new THREE.Mesh(
      new RoundedBoxGeometry(2.22, 0.15, 0.62, 3, 0.045),
      fixtureMaterial,
    );
    ceilingFixture.position.set(0.35, ROOM_HEIGHT - 0.1, -0.7);
    ceilingFixture.castShadow = false;
    this.scene.add(ceilingFixture);

    const fixtureInset = box(
      [1.92, 0.035, 0.4],
      0x171a18,
      [0.35, ROOM_HEIGHT - 0.2, -0.7],
    );
    fixtureInset.castShadow = false;
    this.scene.add(fixtureInset);

    const tubeMaterial = new THREE.MeshStandardMaterial({
      color: 0xd5ddd1,
      emissive: 0xb8c7b5,
      emissiveIntensity: 1.65,
      roughness: 0.42,
    });
    for (const zOffset of [-0.13, 0.13]) {
      const tube = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.035, 1.78, 14), tubeMaterial);
      tube.rotation.z = Math.PI / 2;
      tube.position.set(0.35, ROOM_HEIGHT - 0.22, -0.7 + zOffset);
      this.scene.add(tube);
      for (const side of [-1, 1]) {
        const cap = new THREE.Mesh(
          new THREE.CylinderGeometry(0.045, 0.045, 0.075, 12),
          fixtureMaterial,
        );
        cap.rotation.z = Math.PI / 2;
        cap.position.set(0.35 + side * 0.92, ROOM_HEIGHT - 0.22, -0.7 + zOffset);
        this.scene.add(cap);
      }
    }

    this.scene.add(
      box(
        [0.09, 0.09, ROOM_HALF_DEPTH * 1.75],
        0x343936,
        [-ROOM_HALF_WIDTH + 0.2, 2.92, 0],
      ),
    );
    this.scene.add(
      box(
        [ROOM_HALF_WIDTH * 1.85, 0.07, 0.07],
        0x303532,
        [0, 2.93, -ROOM_HALF_DEPTH + 0.18],
      ),
    );

    const switchPlate = new THREE.Mesh(
      new RoundedBoxGeometry(0.15, 0.25, 0.035, 2, 0.018),
      standardMaterial(0x9b978b, 0.72, 0.08),
    );
    switchPlate.position.set(2.25, 1.3, -ROOM_HALF_DEPTH + 0.035);
    switchPlate.castShadow = true;
    this.scene.add(switchPlate);
    this.scene.add(
      box(
        [0.055, 0.11, 0.025],
        standardMaterial(0x605e56, 0.68, 0.12),
        [2.25, 1.31, -ROOM_HALF_DEPTH + 0.07],
      ),
    );

  }

  private createFurniture(): void {
    const woodTexture = this.loadTexture('/assets/materials/furniture-wood.png', 1.15, 1.45);
    const bedFabricTexture = this.loadTexture('/assets/materials/bed-fabric.png', 1.2, 1.7);
    const woodMaterial = new THREE.MeshStandardMaterial({
      color: 0xc5ad98,
      roughness: 0.78,
      map: woodTexture,
      bumpMap: woodTexture,
      bumpScale: 0.025,
    });
    const darkWoodMaterial = new THREE.MeshStandardMaterial({
      color: 0x987d6b,
      roughness: 0.84,
      map: woodTexture,
      bumpMap: woodTexture,
      bumpScale: 0.02,
    });
    const bedFabricMaterial = new THREE.MeshStandardMaterial({
      color: 0xb4777e,
      roughness: 0.95,
      map: bedFabricTexture,
      bumpMap: bedFabricTexture,
      bumpScale: 0.018,
    });
    const wardrobeDoorMaterial = new THREE.MeshStandardMaterial({
      color: 0x9b806d,
      roughness: 0.82,
      map: woodTexture,
      bumpMap: woodTexture,
      bumpScale: 0.035,
    });

    const wardrobe = new THREE.Group();
    wardrobe.add(box([3.34, 2.78, 0.1], darkWoodMaterial, [-1.25, 1.39, -4.49], 'wardrobe'));
    wardrobe.add(box([3.48, 0.16, 0.72], darkWoodMaterial, [-1.25, 2.76, -4.2], 'wardrobe'));
    wardrobe.add(box([3.42, 0.13, 0.72], darkWoodMaterial, [-1.25, 0.08, -4.2], 'wardrobe'));
    for (const x of [-2.87, 0.37]) {
      wardrobe.add(box([0.14, 2.66, 0.72], darkWoodMaterial, [x, 1.42, -4.2], 'wardrobe'));
    }
    for (const x of [-1.79, -0.71]) {
      wardrobe.add(box([0.07, 2.55, 0.64], darkWoodMaterial, [x, 1.4, -4.22], 'wardrobe'));
    }

    for (const x of [-2.33, -1.25, -0.17]) {
      wardrobe.add(box([0.98, 0.43, 0.1], wardrobeDoorMaterial, [x, 0.34, -3.82], 'wardrobe'));
      wardrobe.add(box([0.74, 0.045, 0.045], darkWoodMaterial, [x, 0.49, -3.755], 'wardrobe'));
      wardrobe.add(box([0.74, 0.045, 0.045], darkWoodMaterial, [x, 0.19, -3.755], 'wardrobe'));
      wardrobe.add(box([0.24, 0.035, 0.055], 0x9f896b, [x, 0.34, -3.74], 'wardrobe'));
    }

    wardrobe.add(box([3.62, 0.11, 0.82], darkWoodMaterial, [-1.25, 2.89, -4.18], 'wardrobe'));
    wardrobe.add(box([3.5, 0.08, 0.76], woodMaterial, [-1.25, 2.83, -4.16], 'wardrobe'));

    addObjectId(wardrobe, 'wardrobe');
    this.scene.add(wardrobe);
    this.interactables.push(wardrobe);
    this.colliders.push({ minX: -2.9, maxX: 0.45, minZ: -4.6, maxZ: -3.72 });

    const wardrobeInterior = new THREE.Group();
    const closetCavity = box([2.68, 2.28, 0.09], 0x111211, [-1.2, 1.48, -3.48], 'wardrobe');
    wardrobeInterior.add(closetCavity);

    const createWardrobeHook = (x: number): THREE.Group => {
      const hook = new THREE.Group();
      const metal = standardMaterial(0x4c4944, 0.48, 0.62);
      hook.add(box([0.12, 0.14, 0.035], metal, [x, 2.31, -3.405], 'wardrobe'));

      const peg = new THREE.Mesh(new THREE.CylinderGeometry(0.026, 0.026, 0.14, 12), metal);
      peg.rotation.x = Math.PI / 2;
      peg.position.set(x, 2.31, -3.325);
      peg.castShadow = true;
      peg.userData.objectId = 'wardrobe';
      hook.add(peg);

      const lip = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 0.12, 12), metal);
      lip.position.set(x, 2.36, -3.265);
      lip.castShadow = true;
      lip.userData.objectId = 'wardrobe';
      hook.add(lip);
      return hook;
    };
    wardrobeInterior.add(createWardrobeHook(-2.33), createWardrobeHook(-1.25));

    const receiptCollectible = new THREE.Group();
    const receipt = plane(
      [0.24, 0.18],
      new THREE.MeshStandardMaterial({
        color: 0xb8ac90,
        roughness: 0.96,
        side: THREE.DoubleSide,
      }),
      [0.51, 0.25, -0.068],
    );
    receipt.rotation.set(0, Math.PI, -0.06);
    receipt.userData.objectId = 'receipt';
    receipt.castShadow = true;
    receiptCollectible.add(receipt);
    const receiptHitArea = interactionProxy(
      [0.36, 0.32, 0.1],
      [0.51, 0.25, -0.075],
      'receipt',
    );
    receiptCollectible.add(receiptHitArea);
    receiptCollectible.visible = false;
    this.collectibleObjects.set('receipt', receiptCollectible);
    this.interactables.push(receiptCollectible);
    wardrobeInterior.visible = false;
    wardrobeInterior.position.z = -0.82;
    this.wardrobeContents = wardrobeInterior;
    this.scene.add(wardrobeInterior);

    const safeMetal = new THREE.MeshStandardMaterial({
      color: 0x343433,
      roughness: 0.68,
      metalness: 0.58,
    });
    const safeEdge = new THREE.MeshStandardMaterial({
      color: 0x171817,
      roughness: 0.82,
      metalness: 0.42,
    });
    const safe = new THREE.Group();
    safe.position.set(-0.18, 0.83, -4.14);
    safe.add(box([0.82, 0.66, 0.06], safeEdge, [0, 0, -0.23], 'safe'));
    safe.add(box([0.82, 0.07, 0.5], safeMetal, [0, 0.295, 0], 'safe'));
    safe.add(box([0.82, 0.07, 0.5], safeMetal, [0, -0.295, 0], 'safe'));
    safe.add(box([0.07, 0.54, 0.5], safeMetal, [-0.375, 0, 0], 'safe'));
    safe.add(box([0.07, 0.54, 0.5], safeMetal, [0.375, 0, 0], 'safe'));

    const safeDoor = new THREE.Group();
    safeDoor.position.set(-0.405, 0, 0.285);
    const safeDoorPanel = box([0.79, 0.6, 0.075], safeMetal, [0.395, 0, 0], 'safe');
    safeDoor.add(safeDoorPanel);
    safeDoor.add(box([0.63, 0.045, 0.035], safeEdge, [0.395, 0.235, 0.055], 'safe'));
    safeDoor.add(box([0.63, 0.045, 0.035], safeEdge, [0.395, -0.235, 0.055], 'safe'));

    const safeHandle = new THREE.Mesh(
      new THREE.CylinderGeometry(0.04, 0.04, 0.075, 16),
      standardMaterial(0x8b8372, 0.42, 0.68),
    );
    safeHandle.rotation.x = Math.PI / 2;
    safeHandle.position.set(0.18, -0.02, 0.085);
    safeHandle.userData.objectId = 'safe';
    safeDoor.add(safeHandle);

    const safeKeypadAnchor = new THREE.Group();
    safeKeypadAnchor.position.set(0.55, -0.17, 0.07);
    safeDoor.add(safeKeypadAnchor);
    this.loadModelInto(
      safeKeypadAnchor,
      '/assets/models/room407/keypad_lock/scene.gltf',
      -Math.PI / 2,
      0.31,
      (keypadModel) => addObjectId(keypadModel, 'safe'),
    );

    addObjectId(safeDoor, 'safe');
    safe.add(safeDoor);
    addObjectId(safe, 'safe');
    safe.visible = false;
    this.safeGroup = safe;
    this.safeDoor = safeDoor;
    this.scene.add(safe);
    this.interactables.push(safe);

    this.loadModel(
      '/assets/models/room407/raincoat/scene.gltf',
      [-2.33, 0.67, -4.03],
      -Math.PI / 2,
      1.72,
      'wardrobe',
      (model) => {
        this.styleRaincoat(model);
        this.lowerGarmentSleeves(model, THREE.MathUtils.degToRad(28));
        wardrobeInterior.attach(model);
      },
      [0.9, 1, 0.7],
    );
    this.loadModel(
      '/assets/models/room407/shirt/scene.gltf',
      [-1.25, 1.3, -4.05],
      0,
      1.04,
      'wardrobe',
      (model) => {
        this.styleShirt(model);
        this.lowerGarmentSleeves(model, THREE.MathUtils.degToRad(18));
        wardrobeInterior.attach(model);
      },
      [0.92, 1, 0.7],
    );

    const createWardrobeDoor = (
      hingeX: number,
      panelCenterX: number,
      handleX: number,
      objectId: RoomObjectId,
    ): THREE.Group => {
      const pivot = new THREE.Group();
      pivot.position.set(hingeX, 1.65, -3.82);
      const panel = box(
        [1.02, 2.04, 0.12],
        wardrobeDoorMaterial,
        [panelCenterX, 0, 0],
        objectId,
      );
      pivot.add(panel);
      for (const y of [-0.84, 0.84]) {
        pivot.add(
          box([0.82, 0.055, 0.05], darkWoodMaterial, [panelCenterX, y, 0.085], objectId),
        );
      }
      for (const edge of [-0.4, 0.4]) {
        pivot.add(
          box(
            [0.055, 1.66, 0.05],
            darkWoodMaterial,
            [panelCenterX + edge, 0, 0.085],
            objectId,
          ),
        );
      }
      pivot.add(box([0.045, 0.23, 0.055], 0xa48a62, [handleX, 0, 0.115], objectId));
      addObjectId(pivot, objectId);
      this.scene.add(pivot);
      this.interactables.push(pivot);
      return pivot;
    };

    const leftWardrobeDoor = createWardrobeDoor(
      -2.84,
      0.51,
      0.86,
      'wardrobeLeft',
    );
    leftWardrobeDoor.add(receiptCollectible);
    const middleWardrobeDoor = createWardrobeDoor(
      -0.72,
      -0.51,
      -0.86,
      'wardrobeMiddle',
    );
    const rightWardrobeDoor = createWardrobeDoor(
      0.36,
      -0.51,
      -0.86,
      'wardrobeRight',
    );
    this.wardrobeDoors = [
      {
        section: 'left',
        object: leftWardrobeDoor,
        closedRotationY: 0,
        openRotationY: -1.42,
        progress: 0,
        target: 0,
      },
      {
        section: 'middle',
        object: middleWardrobeDoor,
        closedRotationY: 0,
        openRotationY: 1.42,
        progress: 0,
        target: 0,
      },
      {
        section: 'right',
        object: rightWardrobeDoor,
        closedRotationY: 0,
        openRotationY: 1.42,
        progress: 0,
        target: 0,
      },
    ];

    const door = new THREE.Group();
    door.add(box([1.45, 2.67, 0.18], darkWoodMaterial, [3.25, 1.34, -4.47], 'door'));
    door.add(box([1.67, 0.12, 0.28], darkWoodMaterial, [3.25, 2.7, -4.4], 'door'));
    door.add(box([0.12, 2.82, 0.28], darkWoodMaterial, [2.46, 1.41, -4.4], 'door'));
    door.add(box([0.12, 2.82, 0.28], darkWoodMaterial, [4.04, 1.41, -4.4], 'door'));
    door.add(box([1.08, 0.055, 0.045], woodMaterial, [3.25, 2.33, -4.35], 'door'));
    door.add(box([1.08, 0.055, 0.045], woodMaterial, [3.25, 0.44, -4.35], 'door'));
    door.add(box([0.055, 1.95, 0.045], woodMaterial, [2.75, 1.38, -4.35], 'door'));
    door.add(box([0.055, 1.95, 0.045], woodMaterial, [3.75, 1.38, -4.35], 'door'));

    const plaque = plane(
      [0.43, 0.21],
      new THREE.MeshStandardMaterial({
        map: createLabelTexture('407'),
        roughness: 0.65,
        metalness: 0.25,
      }),
      [3.25, 1.83, -4.365],
    );
    plaque.userData.objectId = 'door';
    this.scene.add(plaque);
    this.interactables.push(plaque);

    const knob = new THREE.Mesh(
      new THREE.SphereGeometry(0.095, 20, 14),
      standardMaterial(0x8a765e, 0.42, 0.48),
    );
    knob.position.set(3.72, 1.23, -4.28);
    knob.userData.objectId = 'door';
    door.add(knob);

    door.add(box([0.08, 0.18, 0.055], 0x777368, [2.17, 1.27, -4.35], 'door'));
    addObjectId(door, 'door');
    this.scene.add(door);
    this.interactables.push(door);
    this.loadModel(
      '/assets/models/room407/door/scene.gltf',
      [3.25, 0, -4.4],
      Math.PI / 2,
      2.76,
      'door',
      (model) => {
        this.styleDoor(model);
        door.visible = false;
      },
    );

    const bed = new THREE.Group();
    bed.position.set(3.16, 0, 3.16);
    bed.rotation.y = 0;
    bed.scale.setScalar(1.24);
    bed.add(box([1.55, 0.38, 2.3], darkWoodMaterial, [0, 0.33, 0]));
    bed.add(box([1.64, 1.03, 0.16], woodMaterial, [0, 0.73, 1.12]));
    bed.add(box([1.45, 0.22, 2.15], 0x5b5751, [0, 0.62, -0.05]));
    bed.add(box([1.47, 0.15, 2.08], bedFabricMaterial, [0, 0.8, -0.05]));
    this.scene.add(bed);

    const quiltMaterial = bedFabricMaterial.clone();
    quiltMaterial.side = THREE.DoubleSide;
    quiltMaterial.roughness = 1;
    const blanket = createDrapedBlanket(quiltMaterial);
    blanket.position.set(0, 0.91, -0.05);
    blanket.scale.set(0.72, 0.68, 1);
    bed.add(blanket);
    const pillowMaterial = new THREE.MeshStandardMaterial({
      color: 0x65504d,
      roughness: 1,
      map: bedFabricTexture,
      bumpMap: bedFabricTexture,
      bumpScale: 0.012,
    });
    const pillow = new THREE.Mesh(
      new RoundedBoxGeometry(0.78, 0.16, 0.58, 5, 0.12),
      pillowMaterial,
    );
    pillow.position.set(-0.35, 1.02, 0.72);
    pillow.rotation.y = -0.08;
    pillow.rotation.z = 0.035;
    pillow.castShadow = true;
    bed.add(pillow);
    const secondPillow = pillow.clone();
    secondPillow.position.set(0.31, 1.0, 0.74);
    secondPillow.rotation.y = 0.1;
    secondPillow.rotation.z = -0.025;
    bed.add(secondPillow);

    const placeBedAgainstCorner = (object: THREE.Object3D): THREE.Box3 => {
      object.updateMatrixWorld(true);
      const bounds = new THREE.Box3().setFromObject(object);
      const headboardBounds = new THREE.Box3();
      const headboardMinimumY = bounds.max.y - bounds.getSize(new THREE.Vector3()).y * 0.12;
      const vertex = new THREE.Vector3();

      object.traverse((child) => {
        if (!(child instanceof THREE.Mesh)) return;
        const position = child.geometry.getAttribute('position');
        if (!position) return;
        for (let index = 0; index < position.count; index += 1) {
          vertex.fromBufferAttribute(position, index).applyMatrix4(child.matrixWorld);
          if (vertex.y >= headboardMinimumY) headboardBounds.expandByPoint(vertex);
        }
      });

      const cornerAnchor = headboardBounds.isEmpty() ? bounds : headboardBounds;
      object.position.x += ROOM_HALF_WIDTH - 0.6 - cornerAnchor.max.x;
      object.position.z += ROOM_HALF_DEPTH - 0.08 - cornerAnchor.max.z;
      object.updateMatrixWorld(true);
      return new THREE.Box3().setFromObject(object);
    };

    const fallbackBedBounds = placeBedAgainstCorner(bed);
    const bedCollider: CollisionRect = {
      minX: fallbackBedBounds.min.x,
      maxX: fallbackBedBounds.max.x,
      minZ: fallbackBedBounds.min.z,
      maxZ: fallbackBedBounds.max.z,
    };
    this.colliders.push(bedCollider);

    this.loadModel(
      '/assets/models/room407/old_bed/old-bed.glb',
      [3.16, 0, 3.16],
      Math.PI * 0.75,
      1.38,
      undefined,
      (model) => {
        bed.visible = false;
        const modelBounds = placeBedAgainstCorner(model);
        bedCollider.minX = modelBounds.min.x;
        bedCollider.maxX = modelBounds.max.x;
        bedCollider.minZ = modelBounds.min.z;
        bedCollider.maxZ = modelBounds.max.z;
      },
    );

    const table = new THREE.Group();
    table.add(box([1.12, 0.14, 3.2], darkWoodMaterial, [-3.82, 0.98, 0.62], 'table'));
    for (const x of [-4.24, -3.42]) {
      for (const z of [-0.73, 1.97]) {
        table.add(box([0.14, 0.9, 0.14], darkWoodMaterial, [x, 0.48, z], 'table'));
      }
    }
    table.add(box([0.12, 0.48, 2.82], darkWoodMaterial, [-4.27, 0.72, 0.62], 'table'));
    table.add(box([0.78, 0.1, 1.12], woodMaterial, [-3.83, 0.56, 1.22], 'table'));
    addObjectId(table, 'table');
    this.scene.add(table);
    this.interactables.push(table);
    this.colliders.push({ minX: -4.4, maxX: -3.28, minZ: -0.72, maxZ: 1.82 });

    const drawer = new THREE.Group();
    const drawerMetal = new THREE.MeshStandardMaterial({
      color: 0x525a58,
      roughness: 0.76,
      metalness: 0.28,
    });
    drawer.position.set(-3.85, 0.63, 1.15);
    drawer.add(box([0.84, 0.06, 1.02], drawerMetal, [0, 0, 0], 'drawer'));
    drawer.add(box([0.08, 0.34, 1.08], drawerMetal, [0.42, 0.17, 0], 'drawer'));
    drawer.add(box([0.08, 0.27, 1.02], drawerMetal, [-0.4, 0.14, 0], 'drawer'));
    drawer.add(box([0.78, 0.25, 0.06], drawerMetal, [0, 0.14, -0.5], 'drawer'));
    drawer.add(box([0.78, 0.25, 0.06], drawerMetal, [0, 0.14, 0.5], 'drawer'));
    drawer.add(box([0.04, 0.1, 0.32], 0x999078, [0.465, 0.18, 0], 'drawer'));
    const fallbackKeyhole = new THREE.Mesh(
      new THREE.CylinderGeometry(0.012, 0.012, 0.008, 18),
      standardMaterial(0x17130f, 0.5, 0.5),
    );
    fallbackKeyhole.rotation.z = Math.PI / 2;
    fallbackKeyhole.position.set(0.512, 0.18, 0);
    fallbackKeyhole.userData.objectId = 'drawer';
    drawer.add(fallbackKeyhole);
    this.deskDrawer = drawer;
    this.drawerClosedPosition.copy(drawer.position);
    this.drawerOpenOffset.set(0.82, 0, 0);
    this.scene.add(drawer);
    this.interactables.push(drawer);

    const tape = new THREE.Group();
    const tapeFallback = new THREE.Group();
    tape.position.set(0.08, 0.11, -0.27);
    tapeFallback.add(box([0.28, 0.075, 0.36], 0x242525, [0, 0, 0], 'tape'));
    for (const z of [-0.105, 0.105]) {
      const reel = new THREE.Mesh(
        new THREE.CylinderGeometry(0.06, 0.06, 0.084, 18),
        standardMaterial(0xc0b9a8, 0.48),
      );
      reel.position.set(0, 0.008, z);
      reel.userData.objectId = 'tape';
      tapeFallback.add(reel);
    }
    tape.add(tapeFallback);
    tape.add(interactionProxy([0.42, 0.18, 0.48], [0, 0.04, 0], 'tape'));
    addObjectId(tape, 'tape');
    tape.visible = false;
    drawer.add(tape);
    this.collectibleObjects.set('tape', tape);
    this.interactables.push(tape);
    this.loadModelInto(
      tape,
      '/assets/models/room407/recording_tape/scene.gltf',
      Math.PI / 2,
      0.075,
      (model) => {
        model.position.y -= 0.0375;
        model.scale.x *= 0.8;
        addObjectId(model, 'tape');
        tapeFallback.visible = false;
      },
    );

    const oldBattery = new THREE.Group();
    oldBattery.position.set(0.08, 0.13, 0.11);
    const oldBatteryMesh = new THREE.Mesh(
      new THREE.CylinderGeometry(0.055, 0.055, 0.31, 16),
      new THREE.MeshStandardMaterial({ color: 0x777159, roughness: 0.62, metalness: 0.35 }),
    );
    oldBatteryMesh.rotation.x = Math.PI / 2;
    oldBatteryMesh.userData.objectId = 'oldBattery';
    oldBatteryMesh.castShadow = true;
    oldBattery.add(oldBatteryMesh);
    oldBattery.add(interactionProxy([0.24, 0.18, 0.42], [0, 0, 0], 'oldBattery'));
    addObjectId(oldBattery, 'oldBattery');
    oldBattery.visible = false;
    drawer.add(oldBattery);
    this.collectibleObjects.set('oldBattery', oldBattery);
    this.interactables.push(oldBattery);
    this.loadModelInto(
      oldBattery,
      '/assets/models/room407/simple_battery/scene.gltf',
      0,
      0.09,
      (model) => {
        addObjectId(model, 'oldBattery');
        oldBatteryMesh.visible = false;
        model.traverse((child) => {
          if (!(child instanceof THREE.Mesh)) return;
          const materialWasArray = Array.isArray(child.material);
          const source: THREE.Material[] = materialWasArray
            ? child.material
            : [child.material];
          const weatheredMaterials = source.map((material) => {
            if (!(material instanceof THREE.MeshStandardMaterial)) return material;
            const weathered = new THREE.MeshBasicMaterial({
              map: material.map,
              color: 0xd0b07c,
              side: material.side,
            });
            weathered.toneMapped = false;
            return weathered;
          });
          child.material = materialWasArray ? weatheredMaterials : weatheredMaterials[0];
        });
      },
      [1, 1, 1],
      'largest',
    );

    const smallKey = new THREE.Group();
    const smallKeyFallback = new THREE.Group();
    smallKey.position.set(-0.18, 0.65, -3.82);
    smallKey.rotation.set(-Math.PI / 2, 0, Math.PI / 2 - 0.2);
    smallKey.scale.setScalar(1.12);
    const keyRing = new THREE.Mesh(
      new THREE.TorusGeometry(0.075, 0.018, 8, 20),
      standardMaterial(0xa49b82, 0.35, 0.68),
    );
    keyRing.rotation.x = Math.PI / 2;
    keyRing.userData.objectId = 'smallKey';
    smallKeyFallback.add(keyRing);
    const keyShaft = box([0.035, 0.025, 0.25], 0xa49b82, [0, 0, -0.16], 'smallKey');
    smallKeyFallback.add(keyShaft);
    smallKeyFallback.scale.setScalar(0.55);
    smallKey.add(smallKeyFallback);
    smallKey.add(interactionProxy([0.28, 0.16, 0.42], [0, 0, -0.08], 'smallKey'));
    addObjectId(smallKey, 'smallKey');
    smallKey.visible = false;
    this.scene.add(smallKey);
    this.collectibleObjects.set('smallKey', smallKey);
    this.interactables.push(smallKey);
    this.loadModelInto(
      smallKey,
      '/assets/models/room407/key/scene.gltf',
      0,
      0.085,
      (model) => {
        addObjectId(model, 'smallKey');
        smallKeyFallback.visible = false;
        model.traverse((child) => {
          if (!(child instanceof THREE.Mesh)) return;
          const materialWasArray = Array.isArray(child.material);
          const source: THREE.Material[] = materialWasArray
            ? child.material
            : [child.material];
          const wornMetalMaterials = source.map((material, index) => {
            if (!(material instanceof THREE.MeshStandardMaterial)) return material;
            const wornMetal = new THREE.MeshBasicMaterial({
              map: material.map,
              color: index === 0 ? 0xc99b5a : 0xe0b66e,
              side: material.side,
            });
            wornMetal.toneMapped = false;
            return wornMetal;
          });
          child.material = materialWasArray ? wornMetalMaterials : wornMetalMaterials[0];
        });
      },
      [1, 1, 1],
      'largest',
    );

    this.loadModel(
      '/assets/models/room407/antique_desk/scene.gltf',
      [-3.94, 0, 0.58],
      Math.PI / 2,
      1.08,
      'table',
      (model) => {
        const modelDrawer =
          model.getObjectByName('Draw 2_low') ?? model.getObjectByName('Draw_2_low');
        if (!modelDrawer) {
          console.warn('Unable to find the center drawer in the antique desk model.');
          return;
        }

        table.visible = false;
        drawer.visible = false;
        const fallbackIndex = this.interactables.indexOf(drawer);
        if (fallbackIndex !== -1) this.interactables.splice(fallbackIndex, 1);

        // Drawer geometry uses X for width, Y for depth and Z for height.
        const keyhole = new THREE.Group();
        keyhole.position.set(0, -0.302, 0.675);
        keyhole.rotation.x = Math.PI / 2;

        const keyholeBezel = new THREE.Mesh(
          new THREE.TorusGeometry(0.014, 0.0035, 8, 20),
          standardMaterial(0x8c7a5c, 0.44, 0.72),
        );
        keyholeBezel.userData.objectId = 'drawer';
        keyhole.add(keyholeBezel);

        const keyholeOpening = new THREE.Mesh(
          new THREE.CircleGeometry(0.0095, 20),
          new THREE.MeshBasicMaterial({ color: 0x090806 }),
        );
        keyholeOpening.position.z = 0.001;
        keyholeOpening.userData.objectId = 'drawer';
        keyhole.add(keyholeOpening);

        const keySlot = new THREE.Mesh(
          new RoundedBoxGeometry(0.006, 0.017, 0.002, 2, 0.002),
          new THREE.MeshBasicMaterial({ color: 0x090806 }),
        );
        keySlot.position.set(0, -0.014, 0.002);
        keySlot.userData.objectId = 'drawer';
        keyhole.add(keySlot);
        modelDrawer.add(keyhole);

        addObjectId(modelDrawer, 'drawer');
        this.interactables.push(modelDrawer);
        this.deskDrawer = modelDrawer;
        this.drawerClosedPosition.copy(modelDrawer.position);
        // The Sketchfab desk stores depth on local Y and height on local Z.
        this.drawerOpenOffset.set(0, -0.42, 0);

        const placements: Array<
          [CollectibleRoomObjectId, number, [number, number, number]]
        > = [
          ['tape', 0.65, [0, 0, 0]],
          ['oldBattery', 1, [Math.PI / 2, 0, -0.16]],
        ];
        for (const [itemId, scale, rotation] of placements) {
          const item = this.collectibleObjects.get(itemId);
          if (!item) continue;
          this.scene.add(item);
          item.position.set(0, 0, 0);
          item.rotation.set(...rotation);
          item.scale.setScalar(scale);
        }
        this.drawerContentsUseWorldPlacement = true;
        this.positionWorldDrawerContents();
        this.deskSurface = model.getObjectByName('Desk_low') ?? model;
        this.placePencilOnDesk(this.deskSurface);
      },
    );

    const radio = box([0.56, 0.42, 0.94], 0x282927, [-4.2, 1.24, 0.24]);
    this.scene.add(radio);
    const radioDial = new THREE.Mesh(
      new THREE.CylinderGeometry(0.075, 0.075, 0.045, 18),
      standardMaterial(0xa29173, 0.4, 0.28),
    );
    radioDial.rotation.z = Math.PI / 2;
    radioDial.position.set(-3.9, 1.26, 0.48);
    this.scene.add(radioDial);

    const antenna = new THREE.Mesh(
      new THREE.CylinderGeometry(0.012, 0.012, 0.74, 8),
      standardMaterial(0x767777, 0.28, 0.7),
    );
    antenna.rotation.z = -0.22;
    antenna.position.set(-4.22, 1.75, 0.46);
    this.scene.add(antenna);
    this.loadModel(
      '/assets/models/room407/sony_recorder/scene.gltf',
      [-3.78, 1.075, -0.05],
      Math.PI / 2,
      0.27,
      undefined,
      (model) => {
        radio.visible = false;
        radioDial.visible = false;
        antenna.visible = false;

        const cover = model.getObjectByName('TCD5_cover');
        const body = model.getObjectByName('TCD5_body');
        if (cover && body) {
          this.recorderCover = cover;
          this.recorderCoverOpenQuaternion.copy(cover.quaternion);
          this.recorderCoverClosedQuaternion.copy(body.quaternion);

          const bodyBounds = new THREE.Box3().setFromObject(body);
          const coverWindow =
            model.getObjectByName('TCD5_cover_TC-D5_op_0') ?? cover;
          coverWindow.traverse((child) => {
            if (!(child instanceof THREE.Mesh)) return;
            child.renderOrder = 9;
            const materials = Array.isArray(child.material) ? child.material : [child.material];
            child.material = materials.map((material) => {
              if (!(material instanceof THREE.MeshStandardMaterial)) return material;
              const transparentWindow = material.clone();
              transparentWindow.transparent = true;
              transparentWindow.opacity = Math.min(transparentWindow.opacity, 0.22);
              transparentWindow.depthWrite = false;
              transparentWindow.roughness = Math.max(transparentWindow.roughness, 0.28);
              return transparentWindow;
            });
          });

          cover.quaternion.copy(this.recorderCoverClosedQuaternion);
          model.updateMatrixWorld(true);
          const slotCenter = new THREE.Box3()
            .setFromObject(coverWindow)
            .getCenter(new THREE.Vector3());
          const slotSize = new THREE.Box3()
            .setFromObject(coverWindow)
            .getSize(new THREE.Vector3());
          const slotLongSide = Math.max(slotSize.x, slotSize.z) * 0.96;
          const slotShortSide = Math.min(slotSize.x, slotSize.z) * 0.9;
          this.recorderTapeFinalRotationY = slotSize.z > slotSize.x ? Math.PI / 2 : 0;
          if (this.recorderTapePhoto) {
            this.recorderTapePhoto.scale.set(
              THREE.MathUtils.clamp(slotLongSide, 0.15, 0.28),
              THREE.MathUtils.clamp(slotShortSide, 0.09, 0.13),
              1,
            );
          }

          this.recorderTapeEnd.set(
            slotCenter.x,
            bodyBounds.max.y - 0.014,
            slotCenter.z,
          );

          cover.quaternion.copy(
            this.recorderTapeInserted
              ? this.recorderCoverClosedQuaternion
              : this.recorderCoverOpenQuaternion,
          );
          model.updateMatrixWorld(true);
          if (this.recorderTape) {
            this.recorderTape.position.copy(this.recorderTapeEnd);
            this.recorderTape.rotation.set(0, this.recorderTapeFinalRotationY, 0);
          }
        }
      },
    );

    const recorderProxy = interactionProxy(
      [0.8, 0.5, 0.78],
      [-3.82, 1.29, -0.05],
      'recorder',
    );
    this.scene.add(recorderProxy);
    this.interactables.push(recorderProxy);

    const recorderTape = new THREE.Group();
    recorderTape.position.copy(this.recorderTapeEnd);
    recorderTape.rotation.set(0, this.recorderTapeFinalRotationY, 0);
    recorderTape.visible = this.recorderTapeInserted;
    this.scene.add(recorderTape);
    this.recorderTape = recorderTape;
    this.loadCassettePhotoInto(recorderTape);

    const pencilCollectible = new THREE.Group();
    pencilCollectible.position.set(-3.78, 1.059, 0.72);
    pencilCollectible.rotation.y = -0.28;
    this.pencilCollectible = pencilCollectible;

    const pencilGeometry = new THREE.CylinderGeometry(0.008, 0.008, 0.2, 10);
    pencilGeometry.rotateZ(Math.PI / 2);
    const pencil = new THREE.Mesh(
      pencilGeometry,
      standardMaterial(0xa77a28, 0.9),
    );
    pencil.userData.objectId = 'pencil';
    pencil.castShadow = true;
    pencilCollectible.add(pencil);

    const pencilTipGeometry = new THREE.ConeGeometry(0.008, 0.028, 10);
    pencilTipGeometry.rotateZ(-Math.PI / 2);
    const pencilTip = new THREE.Mesh(
      pencilTipGeometry,
      standardMaterial(0xbca276, 0.72),
    );
    pencilTip.position.x = 0.114;
    pencilTip.userData.objectId = 'pencil';
    pencilTip.castShadow = true;
    pencilCollectible.add(pencilTip);

    pencilCollectible.add(interactionProxy([0.28, 0.12, 0.18], [0, 0.03, 0], 'pencil'));
    this.scene.add(pencilCollectible);
    this.interactables.push(pencilCollectible);
    this.collectibleObjects.set('pencil', pencilCollectible);
    if (this.deskSurface) this.placePencilOnDesk(this.deskSurface);

    const chair = new THREE.Group();
    chair.add(box([0.72, 0.12, 0.7], woodMaterial, [-2.9, 0.5, 0.62]));
    for (const x of [-3.21, -2.61]) {
      for (const z of [0.32, 0.92]) {
        chair.add(box([0.09, 0.54, 0.09], darkWoodMaterial, [x, 0.26, z]));
      }
    }
    chair.add(box([0.1, 1.02, 0.1], darkWoodMaterial, [-2.58, 0.98, 0.32]));
    chair.add(box([0.1, 1.02, 0.1], darkWoodMaterial, [-2.58, 0.98, 0.92]));
    for (const y of [0.82, 1.08, 1.34]) {
      chair.add(box([0.08, 0.12, 0.62], woodMaterial, [-2.58, y, 0.62]));
    }
    this.scene.add(chair);
    this.colliders.push({ minX: -3.25, maxX: -2.55, minZ: 0.23, maxZ: 1.01 });
    this.loadModel(
      '/assets/models/room407/old_armchair/scene.gltf',
      [-2.9, 0, 0.62],
      -Math.PI / 2,
      1.05,
      undefined,
      () => {
        chair.visible = false;
      },
    );

    const loosePaperMaterial = new THREE.MeshStandardMaterial({
      color: 0x9e9783,
      roughness: 0.98,
      side: THREE.DoubleSide,
    });
    for (const [index, z] of [-0.18, 0.1, 0.38].entries()) {
      const paper = new THREE.Mesh(new THREE.PlaneGeometry(0.34, 0.24), loosePaperMaterial);
      paper.rotation.x = -Math.PI / 2;
      paper.rotation.z = -0.12 + index * 0.1;
      paper.position.set(-3.98 + index * 0.05, 1.057 + index * 0.002, z);
      paper.receiveShadow = true;
      this.scene.add(paper);
    }
  }
}
