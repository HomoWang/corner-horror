import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import QRCode from 'qrcode';
import { parseMessage, type ProtoControllerStateMsg } from './shared/protocol';
import { buildWebSocketUrl, createRoomCode, normalizeRoomCode } from './shared/session';
import { advanceCorridorPose, normalizeAngle, resolveCorridorObstacles, type CorridorPose } from './corridor-motion';
import { addFireHoseStation } from './corridor-fire-hose';
import './corridor-preview.css';

const host = document.querySelector<HTMLElement>('#corridor-preview');
const objective = document.querySelector<HTMLElement>('#story-objective');
const objectiveBox = objective?.querySelector<HTMLElement>('.objective-box');
const objectiveLabel = objective?.querySelector<HTMLElement>('.objective-label');
const qrCanvas = document.querySelector<HTMLCanvasElement>('#qr-code');
const pairingStatus = document.querySelector<HTMLElement>('#pairing-status');
const desktopEquip = document.querySelector<HTMLButtonElement>('#desktop-equip');

if (!host || !objective || !objectiveBox || !objectiveLabel || !qrCanvas || !pairingStatus) {
  throw new Error('Corridor preview UI is incomplete.');
}
const previewHost = host;
const objectiveEl = objective;
const objectiveBoxEl = objectiveBox;
const objectiveLabelEl = objectiveLabel;
const qrCanvasEl = qrCanvas;
const pairingStatusEl = pairingStatus;

const query = new URLSearchParams(location.search);
const skipPairing = query.get('pair') !== '1' || query.get('nopair') === '1';
const autoEquip = query.get('autoequip') === '1';
const REMOTE_CONTROLLER_BASE = 'https://homowang.github.io/corner-horror/';
const REMOTE_RELAY = 'wss://corner-horror-relay-homowang.onrender.com/ws';
const CORRIDOR = {
  halfWidth: 1.72,
  height: 2.78,
  startZ: 1.55,
  endZ: -21.35,
  modelStartZ: 2.25,
  modelEndZ: -22.25,
};
const PLAYER_RADIUS = 0.34;
const fullBounds = {
  minX: -CORRIDOR.halfWidth + PLAYER_RADIUS,
  maxX: CORRIDOR.halfWidth - PLAYER_RADIUS,
  minZ: CORRIDOR.endZ,
  maxZ: CORRIDOR.startZ,
};

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x030303);
scene.fog = new THREE.FogExp2(0x090807, 0.042);

const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.6));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.14;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
previewHost.append(renderer.domElement);

const environmentGenerator = new THREE.PMREMGenerator(renderer);
scene.environment = environmentGenerator.fromScene(new RoomEnvironment(), 0.035).texture;
scene.environmentIntensity = 0.23;
environmentGenerator.dispose();

const camera = new THREE.PerspectiveCamera(64, window.innerWidth / window.innerHeight, 0.06, 42);
const bodyRig = new THREE.Group();
const headRig = new THREE.Group();
headRig.position.y = 1.61;
headRig.add(camera);
bodyRig.add(headRig);
scene.add(bodyRig);

const flashlight = new THREE.SpotLight(0xffe1bf, 62, 16, Math.PI * 0.27, 0.76, 1.25);
flashlight.position.set(0, 0.03, 0.06);
const flashlightTarget = new THREE.Object3D();
flashlightTarget.position.set(0, -0.16, -4.6);
camera.add(flashlight, flashlightTarget);
flashlight.target = flashlightTarget;

const anisotropy = renderer.capabilities.getMaxAnisotropy();
let geometryCount = 0;
let doorCount = 0;

function seededRandom(seed: number) {
  let value = seed >>> 0;
  return () => {
    value = (value * 1664525 + 1013904223) >>> 0;
    return value / 0x1_0000_0000;
  };
}

function textureFromCanvas(canvas: HTMLCanvasElement, color = false): THREE.CanvasTexture {
  const texture = new THREE.CanvasTexture(canvas);
  if (color) texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = anisotropy;
  texture.minFilter = THREE.LinearMipmapLinearFilter;
  texture.magFilter = THREE.LinearFilter;
  return texture;
}

const textureLoader = new THREE.TextureLoader();

function loadSurfaceTexture(file: string, repeatX: number, repeatY: number, offsetX = 0) {
  const texture = textureLoader.load(`${import.meta.env.BASE_URL}assets/corridor-preview/${file}`);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.wrapS = THREE.MirroredRepeatWrapping;
  texture.wrapT = THREE.MirroredRepeatWrapping;
  texture.repeat.set(repeatX, repeatY);
  texture.offset.x = offsetX;
  texture.anisotropy = anisotropy;
  texture.minFilter = THREE.LinearMipmapLinearFilter;
  texture.magFilter = THREE.LinearFilter;
  return texture;
}

function asHeightMap(texture: THREE.Texture) {
  const heightMap = texture.clone();
  heightMap.colorSpace = THREE.NoColorSpace;
  heightMap.needsUpdate = true;
  return heightMap;
}

const wallEntryMap = loadSurfaceTexture('wall-entry-v1.png', 1.7, 1.15);
const wallMap = loadSurfaceTexture('wall-v1.png', 1.85, 1.3);
const floorMap = loadSurfaceTexture('floor-v1.png', 1.7, 10.5);
const ceilingMap = loadSurfaceTexture('ceiling-v1.png', 1.7, 10.5, 0.22);
const doorMap = loadSurfaceTexture('door-v1.png', 1, 1);
const fireDoorMap = loadSurfaceTexture('fire-door-v1.png', 1, 1);
const sootHandprintsMap = textureLoader.load(`${import.meta.env.BASE_URL}assets/corridor-preview/soot-handprints-v1.png`);
sootHandprintsMap.colorSpace = THREE.SRGBColorSpace;
sootHandprintsMap.anisotropy = anisotropy;
sootHandprintsMap.minFilter = THREE.LinearMipmapLinearFilter;
sootHandprintsMap.magFilter = THREE.LinearFilter;

const wallMaterial = new THREE.MeshStandardMaterial({
  map: wallMap,
  roughness: 0.88,
  roughnessMap: asHeightMap(wallMap),
  metalness: 0,
  bumpMap: asHeightMap(wallMap),
  bumpScale: 0.038,
  envMapIntensity: 0.12,
});
const entryWallMaterial = new THREE.MeshStandardMaterial({
  map: wallEntryMap,
  color: 0xaaa39a,
  roughness: 0.9,
  roughnessMap: asHeightMap(wallEntryMap),
  metalness: 0,
  bumpMap: asHeightMap(wallEntryMap),
  bumpScale: 0.025,
  envMapIntensity: 0.1,
});
const severeWallMaterial = wallMaterial.clone();
severeWallMaterial.color.set(0x635c54);
severeWallMaterial.roughness = 0.96;
severeWallMaterial.bumpScale = 0.052;
severeWallMaterial.envMapIntensity = 0.07;
const floorMaterial = new THREE.MeshPhysicalMaterial({
  map: floorMap,
  roughness: 0.61,
  roughnessMap: asHeightMap(floorMap),
  metalness: 0,
  bumpMap: asHeightMap(floorMap),
  bumpScale: 0.024,
  clearcoat: 0.22,
  clearcoatRoughness: 0.46,
  envMapIntensity: 0.28,
});
const ceilingMaterial = new THREE.MeshStandardMaterial({
  map: ceilingMap,
  color: 0x9a9188,
  roughness: 0.91,
  roughnessMap: asHeightMap(ceilingMap),
  metalness: 0,
  bumpMap: asHeightMap(ceilingMap),
  bumpScale: 0.047,
  envMapIntensity: 0.1,
});
const trimMaterial = new THREE.MeshStandardMaterial({ color: 0x171514, roughness: 0.86, metalness: 0.04 });
const woodMaterial = new THREE.MeshStandardMaterial({
  map: doorMap,
  color: 0x6e5847,
  roughness: 0.82,
  roughnessMap: asHeightMap(doorMap),
  metalness: 0.01,
  bumpMap: asHeightMap(doorMap),
  bumpScale: 0.032,
  envMapIntensity: 0.08,
});
const scorchedWoodMaterial = woodMaterial.clone();
scorchedWoodMaterial.color.set(0x3f332b);
scorchedWoodMaterial.roughness = 0.91;
const frameWoodMaterial = woodMaterial.clone();
frameWoodMaterial.color.set(0x4a3a30);
frameWoodMaterial.roughness = 0.9;
const scorchedFrameMaterial = frameWoodMaterial.clone();
scorchedFrameMaterial.color.set(0x2d2520);
scorchedFrameMaterial.roughness = 0.96;
const dullMetalMaterial = new THREE.MeshStandardMaterial({ color: 0x34312c, roughness: 0.75, metalness: 0.34 });
const doorRevealMaterial = new THREE.MeshStandardMaterial({ color: 0x0b0908, roughness: 0.98, metalness: 0 });
const fireDoorMaterial = new THREE.MeshPhysicalMaterial({
  map: fireDoorMap,
  color: 0x8b8981,
  roughness: 0.68,
  roughnessMap: asHeightMap(fireDoorMap),
  metalness: 0.28,
  bumpMap: asHeightMap(fireDoorMap),
  bumpScale: 0.024,
  clearcoat: 0.05,
  clearcoatRoughness: 0.8,
  envMapIntensity: 0.22,
});
const fireDoorFrameMaterial = new THREE.MeshStandardMaterial({
  map: fireDoorMap,
  color: 0x49453e,
  roughness: 0.83,
  metalness: 0.38,
  bumpMap: asHeightMap(fireDoorMap),
  bumpScale: 0.016,
  envMapIntensity: 0.16,
});
const fireDoorHardwareMaterial = new THREE.MeshStandardMaterial({
  color: 0x201f1c,
  roughness: 0.48,
  metalness: 0.72,
  envMapIntensity: 0.34,
});

function addMesh(geometry: THREE.BufferGeometry, material: THREE.Material, position: THREE.Vector3, rotation?: THREE.Euler) {
  const mesh = new THREE.Mesh(geometry, material);
  mesh.position.copy(position);
  if (rotation) mesh.rotation.copy(rotation);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  scene.add(mesh);
  geometryCount += 1;
  return mesh;
}

const corridorLength = CORRIDOR.modelStartZ - CORRIDOR.modelEndZ;
const corridorMiddleZ = (CORRIDOR.modelStartZ + CORRIDOR.modelEndZ) * 0.5;
addMesh(
  new THREE.PlaneGeometry(CORRIDOR.halfWidth * 2, corridorLength, 1, 12),
  floorMaterial,
  new THREE.Vector3(0, 0, corridorMiddleZ),
  new THREE.Euler(-Math.PI / 2, 0, 0),
);
addMesh(
  new THREE.PlaneGeometry(CORRIDOR.halfWidth * 2, corridorLength, 1, 12),
  ceilingMaterial,
  new THREE.Vector3(0, CORRIDOR.height, corridorMiddleZ),
  new THREE.Euler(Math.PI / 2, 0, 0),
);
const wallSections = [
  { startZ: CORRIDOR.modelStartZ, endZ: -4.6, material: entryWallMaterial },
  { startZ: -4.6, endZ: -10.1, material: wallMaterial },
  { startZ: -10.1, endZ: CORRIDOR.modelEndZ, material: severeWallMaterial },
];
for (const side of [-1, 1]) {
  for (const section of wallSections) {
    const length = section.startZ - section.endZ;
    const middleZ = (section.startZ + section.endZ) * 0.5;
    addMesh(
      new THREE.PlaneGeometry(length, CORRIDOR.height, Math.max(2, Math.ceil(length / 2)), 1),
      section.material,
      new THREE.Vector3(side * CORRIDOR.halfWidth, CORRIDOR.height * 0.5, middleZ),
      new THREE.Euler(0, side < 0 ? Math.PI / 2 : -Math.PI / 2, 0),
    );
  }
}

for (const side of [-1, 1]) {
  addMesh(
    new THREE.BoxGeometry(0.09, 0.22, corridorLength),
    trimMaterial,
    new THREE.Vector3(side * (CORRIDOR.halfWidth - 0.035), 0.11, corridorMiddleZ),
  );
}

function makePlaqueTexture(label: string): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 256;
  const context = canvas.getContext('2d');
  if (!context) throw new Error('Canvas 2D is unavailable.');
  const gradient = context.createLinearGradient(0, 0, canvas.width, canvas.height);
  gradient.addColorStop(0, '#39332b');
  gradient.addColorStop(0.52, '#171512');
  gradient.addColorStop(1, '#2b251f');
  context.fillStyle = gradient;
  context.fillRect(0, 0, canvas.width, canvas.height);
  const random = seededRandom(Number(label) * 37);
  for (let i = 0; i < 900; i += 1) {
    const shade = 45 + Math.floor(random() * 38);
    context.fillStyle = `rgba(${shade},${Math.max(0, shade - 7)},${Math.max(0, shade - 14)},${0.08 + random() * 0.14})`;
    context.fillRect(random() * canvas.width, random() * canvas.height, 1 + random() * 5, 1 + random() * 2);
  }
  context.strokeStyle = '#766c5c';
  context.lineWidth = 9;
  context.strokeRect(14, 14, canvas.width - 28, canvas.height - 28);
  context.fillStyle = '#b2a38c';
  context.font = '700 132px Georgia, serif';
  context.textAlign = 'center';
  context.textBaseline = 'middle';
  context.fillText(label, canvas.width / 2, canvas.height / 2 + 7);
  return textureFromCanvas(canvas, true);
}

function addDoor(side: -1 | 1, z: number, label: string, scorched = false, plaqueAttached = true) {
  const doorThickness = 0.045;
  const doorX = side * (CORRIDOR.halfWidth - 0.02);
  const doorFaceX = doorX - side * (doorThickness * 0.5);
  const casingX = side * (CORRIDOR.halfWidth - 0.05);
  const casingMaterial = scorched ? scorchedFrameMaterial : frameWoodMaterial;

  addMesh(
    new THREE.BoxGeometry(0.025, 2.24, 1.13),
    doorRevealMaterial,
    new THREE.Vector3(side * (CORRIDOR.halfWidth - 0.006), 1.12, z),
  );
  addMesh(
    new RoundedBoxGeometry(doorThickness, 2.08, 0.98, 5, 0.012),
    scorched ? scorchedWoodMaterial : woodMaterial,
    new THREE.Vector3(doorX, 1.04, z),
  );
  addMesh(
    new THREE.PlaneGeometry(0.95, 2.05),
    scorched ? scorchedWoodMaterial : woodMaterial,
    new THREE.Vector3(doorFaceX - side * 0.0015, 1.04, z),
    new THREE.Euler(0, side > 0 ? -Math.PI / 2 : Math.PI / 2, 0),
  );
  doorCount += 1;

  for (const offsetZ of [-0.535, 0.535]) {
    addMesh(
      new RoundedBoxGeometry(0.032, 2.22, 0.075, 4, 0.009),
      casingMaterial,
      new THREE.Vector3(casingX, 1.11, z + offsetZ),
    );
    addMesh(
      new THREE.PlaneGeometry(0.068, 2.19),
      casingMaterial,
      new THREE.Vector3(casingX - side * 0.017, 1.11, z + offsetZ),
      new THREE.Euler(0, side > 0 ? -Math.PI / 2 : Math.PI / 2, 0),
    );
  }
  addMesh(
    new RoundedBoxGeometry(0.032, 0.075, 1.145, 4, 0.009),
    casingMaterial,
    new THREE.Vector3(casingX, 2.18, z),
  );
  addMesh(
    new THREE.PlaneGeometry(1.13, 0.068),
    casingMaterial,
    new THREE.Vector3(casingX - side * 0.017, 2.18, z),
    new THREE.Euler(0, side > 0 ? -Math.PI / 2 : Math.PI / 2, 0),
  );
  addMesh(
    new RoundedBoxGeometry(0.04, 0.025, 1.12, 3, 0.006),
    casingMaterial,
    new THREE.Vector3(casingX, 0.014, z),
  );

  const handleZ = z + 0.3;
  const hardwareX = doorFaceX - side * 0.009;
  const rose = addMesh(
    new THREE.CylinderGeometry(0.043, 0.043, 0.012, 24),
    dullMetalMaterial,
    new THREE.Vector3(hardwareX, 0.98, handleZ),
    new THREE.Euler(0, 0, Math.PI / 2),
  );
  rose.castShadow = false;
  const knob = addMesh(
    new THREE.SphereGeometry(0.032, 20, 14),
    dullMetalMaterial,
    new THREE.Vector3(hardwareX - side * 0.032, 0.98, handleZ),
  );
  knob.castShadow = false;

  const peephole = addMesh(
    new THREE.CylinderGeometry(0.012, 0.012, 0.012, 18),
    dullMetalMaterial,
    new THREE.Vector3(hardwareX, 1.57, z),
    new THREE.Euler(0, 0, Math.PI / 2),
  );
  peephole.castShadow = false;

  if (plaqueAttached) {
    const plaqueMaterial = new THREE.MeshStandardMaterial({
      map: makePlaqueTexture(label),
      roughness: 0.64,
      metalness: 0.28,
      envMapIntensity: 0.34,
    });
    addMesh(
      new RoundedBoxGeometry(0.012, 0.085, 0.19, 3, 0.004),
      plaqueMaterial,
      new THREE.Vector3(doorFaceX - side * 0.007, 1.68, z),
    );
  }
}

addDoor(-1, 0.35, '307');
addDoor(1, -1.85, '308');
addDoor(-1, -5.1, '305', true, false);
addDoor(1, -7.85, '306', true);
addDoor(-1, -11.1, '303', true);
addDoor(1, -14.05, '304', true);

const fallenPlaqueMaterial = new THREE.MeshStandardMaterial({
  map: makePlaqueTexture('305'),
  roughness: 0.7,
  metalness: 0.24,
  envMapIntensity: 0.25,
});
addMesh(
  new RoundedBoxGeometry(0.19, 0.012, 0.085, 3, 0.004),
  fallenPlaqueMaterial,
  new THREE.Vector3(-1.25, 0.016, -5.32),
  new THREE.Euler(0.04, 0.34, -0.08),
);

const sootHandprintsMaterial = new THREE.MeshBasicMaterial({
  map: sootHandprintsMap,
  transparent: true,
  opacity: 0.34,
  depthWrite: false,
  alphaTest: 0.025,
  side: THREE.DoubleSide,
  toneMapped: false,
});
const sootTrail = addMesh(
  new THREE.PlaneGeometry(2.25, 0.67),
  sootHandprintsMaterial,
  new THREE.Vector3(-CORRIDOR.halfWidth + 0.008, 1.13, -8.7),
  new THREE.Euler(0, Math.PI / 2, 0),
);
sootTrail.castShadow = false;

function addFireDoor() {
  const z = CORRIDOR.modelEndZ + 0.07;
  addMesh(new THREE.BoxGeometry(CORRIDOR.halfWidth * 2, CORRIDOR.height, 0.18), wallMaterial, new THREE.Vector3(0, CORRIDOR.height * 0.5, CORRIDOR.modelEndZ - 0.08));

  // Deep reveal and smoke seal keep the stair door seated in the wall instead of floating on it.
  addMesh(new THREE.BoxGeometry(2.38, 2.55, 0.2), doorRevealMaterial, new THREE.Vector3(0, 1.275, z - 0.055));
  addMesh(new RoundedBoxGeometry(2.04, 2.31, 0.095, 5, 0.012), fireDoorMaterial, new THREE.Vector3(0, 1.155, z + 0.04));
  addMesh(new THREE.PlaneGeometry(2.01, 2.28), fireDoorMaterial, new THREE.Vector3(0, 1.155, z + 0.089));

  for (const x of [-1.105, 1.105]) {
    addMesh(new RoundedBoxGeometry(0.13, 2.51, 0.19, 4, 0.012), fireDoorFrameMaterial, new THREE.Vector3(x, 1.255, z + 0.015));
    addMesh(new THREE.BoxGeometry(0.028, 2.34, 0.035), fireDoorHardwareMaterial, new THREE.Vector3(x * 0.956, 1.17, z + 0.112));
  }
  addMesh(new RoundedBoxGeometry(2.34, 0.13, 0.19, 4, 0.012), fireDoorFrameMaterial, new THREE.Vector3(0, 2.445, z + 0.015));
  addMesh(new THREE.BoxGeometry(2.08, 0.028, 0.035), fireDoorHardwareMaterial, new THREE.Vector3(0, 2.33, z + 0.112));

  // A real panic bar assembly with two housings, a raised crossbar, and a central latch case.
  const hardwareZ = z + 0.154;
  for (const x of [-0.72, 0.72]) {
    addMesh(new RoundedBoxGeometry(0.13, 0.22, 0.075, 4, 0.012), fireDoorHardwareMaterial, new THREE.Vector3(x, 1.02, hardwareZ));
  }
  addMesh(new RoundedBoxGeometry(1.43, 0.065, 0.07, 4, 0.014), dullMetalMaterial, new THREE.Vector3(0, 1.04, hardwareZ + 0.045));
  addMesh(new RoundedBoxGeometry(0.2, 0.16, 0.07, 4, 0.012), fireDoorHardwareMaterial, new THREE.Vector3(0, 1.02, hardwareZ));

  // Three vertical barrel hinges are visible on the right jamb at close range.
  for (const y of [0.43, 1.16, 1.89]) {
    addMesh(new THREE.CylinderGeometry(0.026, 0.026, 0.17, 16), fireDoorHardwareMaterial, new THREE.Vector3(0.99, y, z + 0.137));
  }

  // Soot-darkened closer and articulated arm complete the institutional fire-door silhouette.
  addMesh(new RoundedBoxGeometry(0.42, 0.12, 0.08, 4, 0.012), fireDoorHardwareMaterial, new THREE.Vector3(0.58, 2.16, hardwareZ));
  const closerArm = addMesh(new THREE.CylinderGeometry(0.012, 0.012, 0.48, 12), dullMetalMaterial, new THREE.Vector3(0.28, 2.2, hardwareZ + 0.025));
  closerArm.rotation.z = Math.PI * 0.39;
  doorCount += 1;
}
addFireDoor();

const pipeMaterial = new THREE.MeshStandardMaterial({ color: 0x201e1b, roughness: 0.7, metalness: 0.48 });
for (const x of [1.35, 1.51]) {
  const pipe = addMesh(
    new THREE.CylinderGeometry(0.035, 0.035, corridorLength, 14),
    pipeMaterial,
    new THREE.Vector3(x, 2.56, corridorMiddleZ),
    new THREE.Euler(Math.PI / 2, 0, 0),
  );
  pipe.castShadow = false;
}

const hoseMaterial = new THREE.MeshStandardMaterial({
  color: 0x351816,
  roughness: 0.86,
  metalness: 0.02,
  bumpMap: asHeightMap(fireDoorMap),
  bumpScale: 0.008,
});
const charredHoseMaterial = hoseMaterial.clone();
charredHoseMaterial.color.set(0x100d0b);
charredHoseMaterial.roughness = 0.96;

const fireHoseStation = addFireHoseStation(scene, {
  wallX: CORRIDOR.halfWidth,
  centerZ: -9.25,
  anisotropy,
});
geometryCount += fireHoseStation.meshCount;

const ceilingVoidMaterial = new THREE.MeshBasicMaterial({ color: 0x010101, side: THREE.DoubleSide });
const cableMaterial = new THREE.MeshStandardMaterial({ color: 0x080707, roughness: 0.9, metalness: 0.16 });
for (const [index, hole] of [
  { x: -0.46, z: -11.65, width: 0.86, length: 1.08 },
  { x: 0.54, z: -17.25, width: 1.02, length: 1.34 },
].entries()) {
  addMesh(
    new THREE.PlaneGeometry(hole.width, hole.length),
    ceilingVoidMaterial,
    new THREE.Vector3(hole.x, CORRIDOR.height - 0.008, hole.z),
    new THREE.Euler(Math.PI / 2, 0, index * 0.12),
  );
  for (const edge of [-1, 1]) {
    const brokenEdge = addMesh(
      new THREE.BoxGeometry(hole.width * 0.82, 0.035, 0.055),
      ceilingMaterial,
      new THREE.Vector3(hole.x, CORRIDOR.height - 0.045, hole.z + edge * hole.length * 0.42),
      new THREE.Euler(edge * 0.08, index * 0.07, edge * 0.05),
    );
    brokenEdge.castShadow = true;
  }
  const cableCurve = new THREE.CatmullRomCurve3([
    new THREE.Vector3(hole.x - 0.18, CORRIDOR.height - 0.02, hole.z),
    new THREE.Vector3(hole.x - 0.12, CORRIDOR.height - 0.28 - index * 0.12, hole.z - 0.08),
    new THREE.Vector3(hole.x + 0.03, CORRIDOR.height - 0.52 - index * 0.18, hole.z + 0.04),
    new THREE.Vector3(hole.x + 0.16, CORRIDOR.height - 0.12, hole.z + 0.18),
  ]);
  addMesh(new THREE.TubeGeometry(cableCurve, 28, 0.012, 8, false), cableMaterial, new THREE.Vector3(0, 0, 0));
}

const sprinklerMaterial = new THREE.MeshStandardMaterial({ color: 0x282824, roughness: 0.7, metalness: 0.58 });
for (const [index, z] of [-4.2, -13.4, -19.35].entries()) {
  const stem = addMesh(
    new THREE.CylinderGeometry(0.018, 0.018, 0.19 + index * 0.025, 12),
    sprinklerMaterial,
    new THREE.Vector3(index === 1 ? -0.35 : 0.38, 2.66 - index * 0.015, z),
  );
  stem.rotation.z = index === 2 ? 0.18 : 0;
  addMesh(
    new THREE.CylinderGeometry(0.065, 0.035, 0.025, 16),
    sprinklerMaterial,
    new THREE.Vector3(index === 1 ? -0.35 : 0.38, 2.55 - index * 0.03, z),
  );
}

const burnedPaperMaterial = new THREE.MeshStandardMaterial({
  color: 0x332a22,
  roughness: 0.98,
  metalness: 0,
  side: THREE.DoubleSide,
});
for (const [index, position] of [
  [-0.86, -6.25],
  [0.58, -10.75],
  [-0.28, -15.52],
  [0.9, -18.62],
].entries()) {
  const paper = addMesh(
    new THREE.PlaneGeometry(0.24, 0.34),
    burnedPaperMaterial,
    new THREE.Vector3(position[0], 0.022, position[1]),
    new THREE.Euler(-Math.PI / 2 + index * 0.018, 0, index * 0.72),
  );
  paper.scale.set(0.75 + index * 0.08, 0.82, 1);
}

const burnedShoe = addMesh(
  new RoundedBoxGeometry(0.2, 0.11, 0.42, 5, 0.035),
  charredHoseMaterial,
  new THREE.Vector3(-1.08, 0.075, -10.92),
  new THREE.Euler(0.06, -0.46, -0.12),
);
burnedShoe.scale.set(0.9, 0.75, 1);

const fixtureMaterial = new THREE.MeshStandardMaterial({
  color: 0xb7aa97,
  emissive: 0xffd7a8,
  emissiveIntensity: 1.8,
  roughness: 0.48,
});
for (const [index, z] of [-2.3, -8.1, -13.9, -19.1].entries()) {
  const localFixtureMaterial = fixtureMaterial.clone();
  localFixtureMaterial.emissiveIntensity = index === 2 ? 0.55 : index === 3 ? 0.9 : 1.8;
  const fixture = addMesh(
    new THREE.BoxGeometry(0.78, 0.055, 0.14),
    localFixtureMaterial,
    new THREE.Vector3(index === 3 ? 0.16 : 0, index >= 2 ? 2.61 : 2.68, z),
  );
  fixture.rotation.set(index === 3 ? 0.16 : 0, index === 2 ? -0.1 : 0, index >= 2 ? 0.08 + index * 0.045 : 0);
  const light = new THREE.RectAreaLight(0xffd5ad, index === 2 ? 4.5 : index === 3 ? 7 : 17, 0.84, 0.16);
  light.position.set(index === 3 ? 0.16 : 0, index >= 2 ? 2.54 : 2.61, z);
  light.lookAt(index === 3 ? 0.44 : 0, 0, z - 0.4);
  scene.add(light);
}

const emergencyLight = new THREE.PointLight(0x7d170d, 7, 6, 1.8);
emergencyLight.position.set(0.92, 2.18, -20.6);
scene.add(emergencyLight);
scene.add(new THREE.HemisphereLight(0x74685c, 0x0a0807, 0.9));

const debrisMaterial = new THREE.MeshStandardMaterial({ color: 0x28231e, roughness: 0.94, metalness: 0.02 });
const debrisGeometry = new THREE.BoxGeometry(0.055, 0.018, 0.1);
const debrisRandom = seededRandom(1703);
const debris = new THREE.InstancedMesh(debrisGeometry, debrisMaterial, 110);
const debrisTransform = new THREE.Object3D();
for (let i = 0; i < 110; i += 1) {
  const side = debrisRandom() > 0.5 ? 1 : -1;
  debrisTransform.position.set(
    side * (1.22 + debrisRandom() * 0.32),
    0.012 + debrisRandom() * 0.016,
    1.5 - debrisRandom() * 22.6,
  );
  debrisTransform.rotation.set(debrisRandom() * 0.28, debrisRandom() * Math.PI, debrisRandom() * 0.3);
  const scale = 0.5 + debrisRandom() * 1.8;
  debrisTransform.scale.set(scale, 0.7 + debrisRandom(), scale * (0.55 + debrisRandom()));
  debrisTransform.updateMatrix();
  debris.setMatrixAt(i, debrisTransform.matrix);
}
debris.castShadow = true;
debris.receiveShadow = true;
scene.add(debris);
geometryCount += 1;

function makeIrregularBloodShape(radiusX: number, radiusZ: number, seed: number, points = 28) {
  const random = seededRandom(seed);
  const shape = new THREE.Shape();
  for (let index = 0; index < points; index += 1) {
    const angle = index / points * Math.PI * 2;
    const wobble = 0.76 + random() * 0.34;
    const x = Math.cos(angle) * radiusX * wobble;
    const z = Math.sin(angle) * radiusZ * wobble;
    if (index === 0) shape.moveTo(x, z);
    else shape.lineTo(x, z);
  }
  shape.closePath();
  return shape;
}

const wetBloodMaterial = new THREE.MeshPhysicalMaterial({
  color: 0x310003,
  roughness: 0.2,
  metalness: 0,
  clearcoat: 0.72,
  clearcoatRoughness: 0.13,
  envMapIntensity: 0.62,
});
const thinBloodMaterial = new THREE.MeshPhysicalMaterial({
  color: 0x4b0507,
  roughness: 0.45,
  metalness: 0,
  clearcoat: 0.28,
  clearcoatRoughness: 0.32,
  envMapIntensity: 0.35,
  transparent: true,
  opacity: 0.88,
  side: THREE.DoubleSide,
});
const coagulatedBloodMaterial = new THREE.MeshStandardMaterial({
  color: 0x210104,
  roughness: 0.7,
  metalness: 0,
  side: THREE.DoubleSide,
});
const bloodImpactMaterial = new THREE.MeshPhysicalMaterial({
  color: 0x5a0709,
  roughness: 0.24,
  clearcoat: 0.58,
  clearcoatRoughness: 0.16,
  transparent: true,
  opacity: 0,
  side: THREE.DoubleSide,
  depthWrite: false,
});

const bloodX = 0.18;
const bloodZ = -3.45;
addMesh(
  new THREE.ShapeGeometry(makeIrregularBloodShape(0.31, 0.19, 2307)),
  thinBloodMaterial,
  new THREE.Vector3(bloodX, 0.007, bloodZ),
  new THREE.Euler(-Math.PI / 2, 0, 0),
);
addMesh(
  new THREE.ShapeGeometry(makeIrregularBloodShape(0.27, 0.055, 3072, 22)),
  coagulatedBloodMaterial,
  new THREE.Vector3(bloodX - 0.16, 0.008, bloodZ + 0.22),
  new THREE.Euler(-Math.PI / 2, 0.18, -0.12),
);
const bloodPuddleCore = addMesh(
  new THREE.SphereGeometry(1, 36, 10, 0, Math.PI * 2, 0, Math.PI / 2),
  wetBloodMaterial,
  new THREE.Vector3(bloodX, 0.008, bloodZ),
);
bloodPuddleCore.scale.set(0.22, 0.013, 0.135);
bloodPuddleCore.castShadow = false;

const splatterRandom = seededRandom(8307);
for (let index = 0; index < 13; index += 1) {
  const angle = splatterRandom() * Math.PI * 2;
  const distance = 0.24 + splatterRandom() * 0.29;
  const radius = 0.007 + splatterRandom() * 0.018;
  const splatter = addMesh(
    new THREE.SphereGeometry(1, 14, 6, 0, Math.PI * 2, 0, Math.PI / 2),
    index % 3 === 0 ? coagulatedBloodMaterial : wetBloodMaterial,
    new THREE.Vector3(
      bloodX + Math.cos(angle) * distance,
      0.007,
      bloodZ + Math.sin(angle) * distance * 0.72,
    ),
  );
  splatter.scale.set(radius * (0.7 + splatterRandom() * 0.8), 0.003 + radius * 0.08, radius);
  splatter.castShadow = false;
}

addMesh(
  new THREE.ShapeGeometry(makeIrregularBloodShape(0.16, 0.11, 1307, 25)),
  coagulatedBloodMaterial,
  new THREE.Vector3(bloodX, CORRIDOR.height - 0.006, bloodZ),
  new THREE.Euler(Math.PI / 2, 0, 0),
);
const bloodCeilingBud = addMesh(
  new THREE.SphereGeometry(0.024, 18, 12),
  wetBloodMaterial,
  new THREE.Vector3(bloodX, CORRIDOR.height - 0.035, bloodZ),
);
bloodCeilingBud.castShadow = false;
const bloodDrop = addMesh(
  new THREE.SphereGeometry(0.024, 18, 12),
  wetBloodMaterial,
  new THREE.Vector3(bloodX, CORRIDOR.height - 0.08, bloodZ),
);
bloodDrop.scale.set(0.72, 2.4, 0.72);
bloodDrop.castShadow = false;
const bloodDropTail = addMesh(
  new THREE.SphereGeometry(0.013, 14, 10),
  wetBloodMaterial,
  new THREE.Vector3(bloodX, CORRIDOR.height - 0.04, bloodZ),
);
bloodDropTail.scale.set(0.7, 1.8, 0.7);
bloodDropTail.visible = false;
bloodDropTail.castShadow = false;
const bloodImpactRing = addMesh(
  new THREE.RingGeometry(0.03, 0.047, 36),
  bloodImpactMaterial,
  new THREE.Vector3(bloodX, 0.012, bloodZ),
  new THREE.Euler(-Math.PI / 2, 0, 0),
);
bloodImpactRing.visible = false;
bloodImpactRing.castShadow = false;

function updateBloodDrip(time: number) {
  const cycle = time % 2.85;
  const ceilingY = CORRIDOR.height - 0.065;
  const floorY = 0.045;
  bloodCeilingBud.visible = cycle < 0.62;
  if (bloodCeilingBud.visible) {
    const growth = THREE.MathUtils.smoothstep(cycle, 0, 0.62);
    bloodCeilingBud.scale.set(0.56 + growth * 0.42, 0.7 + growth * 1.45, 0.56 + growth * 0.42);
  }

  if (cycle >= 0.62 && cycle < 1.28) {
    const fall = (cycle - 0.62) / 0.66;
    const easedFall = fall * fall;
    bloodDrop.visible = true;
    bloodDrop.position.y = THREE.MathUtils.lerp(ceilingY, floorY, easedFall);
    bloodDrop.scale.set(0.72 - fall * 0.16, 2.35 + fall * 1.4, 0.72 - fall * 0.16);
    bloodDropTail.visible = fall > 0.16 && fall < 0.82;
    bloodDropTail.position.y = bloodDrop.position.y + 0.11 + fall * 0.08;
    bloodImpactRing.visible = false;
    bloodImpactMaterial.opacity = 0;
    document.body.dataset.bloodState = 'falling';
    document.body.dataset.bloodDropY = bloodDrop.position.y.toFixed(3);
    return;
  }

  bloodDrop.visible = false;
  bloodDropTail.visible = false;
  const impactAge = cycle - 1.28;
  if (impactAge >= 0 && impactAge < 0.42) {
    const impact = impactAge / 0.42;
    bloodImpactRing.visible = true;
    bloodImpactRing.scale.setScalar(0.72 + impact * 3.2);
    bloodImpactMaterial.opacity = (1 - impact) * 0.48;
    bloodPuddleCore.scale.set(0.22 + impact * 0.018, 0.013 - impact * 0.002, 0.135 + impact * 0.013);
    document.body.dataset.bloodState = 'impact';
  } else {
    bloodImpactRing.visible = false;
    bloodImpactMaterial.opacity = 0;
    bloodPuddleCore.scale.set(0.238, 0.011, 0.148);
    document.body.dataset.bloodState = 'pooling';
  }
  document.body.dataset.bloodDropY = floorY.toFixed(3);
}

function makeSmokeTexture(): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = 256;
  const context = canvas.getContext('2d');
  if (!context) throw new Error('Canvas 2D is unavailable.');
  const gradient = context.createRadialGradient(128, 128, 10, 128, 128, 124);
  gradient.addColorStop(0, 'rgba(52,48,43,0.74)');
  gradient.addColorStop(0.42, 'rgba(35,32,29,0.48)');
  gradient.addColorStop(0.78, 'rgba(18,17,16,0.18)');
  gradient.addColorStop(1, 'rgba(0,0,0,0)');
  context.fillStyle = gradient;
  context.fillRect(0, 0, 256, 256);
  return textureFromCanvas(canvas, true);
}

const smokeTexture = makeSmokeTexture();
const smokeClouds: Array<{ sprite: THREE.Sprite; baseX: number; baseY: number; phase: number; speed: number }> = [];
const smokeRandom = seededRandom(607);
for (let i = 0; i < 38; i += 1) {
  const material = new THREE.SpriteMaterial({
    map: smokeTexture,
    color: 0x82776b,
    transparent: true,
    opacity: 0.08 + smokeRandom() * 0.09,
    depthWrite: false,
  });
  const sprite = new THREE.Sprite(material);
  const baseX = (smokeRandom() - 0.5) * 2.5;
  const baseY = 2.2 + smokeRandom() * 0.42;
  sprite.position.set(baseX, baseY, 1.1 - smokeRandom() * 22.8);
  sprite.scale.set(2.1 + smokeRandom() * 1.4, 0.7 + smokeRandom() * 0.5, 1);
  scene.add(sprite);
  smokeClouds.push({ sprite, baseX, baseY, phase: smokeRandom() * Math.PI * 2, speed: 0.08 + smokeRandom() * 0.16 });
}

const inspectMode = query.get('inspect');
let pose: CorridorPose = inspectMode === 'fire-door'
  ? { x: 0, z: -19.25, yaw: 0 }
  : inspectMode === 'story-mid'
    ? { x: 0, z: -6.35, yaw: 0 }
  : inspectMode === 'story-rear'
    ? { x: 0, z: -12.35, yaw: 0 }
  : inspectMode === 'fire-cabinet'
    ? { x: 0.05, z: -7.75, yaw: -0.72 }
  : inspectMode === 'fire-cabinet-close'
    ? { x: 0.6, z: -9.25, yaw: -Math.PI / 2 }
  : inspectMode === 'hose-return'
    ? { x: 0.2, z: -12.6, yaw: Math.PI }
  : inspectMode === 'hose-burn'
    ? { x: 0.15, z: -10.75, yaw: -0.38 }
  : inspectMode === 'door'
  ? { x: 0.34, z: -1.85, yaw: Math.PI / 2 }
  : inspectMode === 'blood'
    ? { x: 0, z: -1.75, yaw: 0 }
    : { x: 0, z: 1.2, yaw: 0 };
let movement = { forward: 0, turn: 0 };
let phoneMove = { x: 0, y: 0 };
let phoneLook = { x: 0, y: 0 };
let mouseLook = { x: 0, y: 0 };
let navigationPulse = 0;
let navigationPulseUntil = 0;
let gearEquipped = false;
let objectiveCompleted = false;
let highLookDuration = 0;
let lastWarningVibration = 0;
let controllerConnected = false;
let ws: WebSocket | null = null;
let reconnectTimer: number | null = null;
let reconnectEnabled = true;

const roomCode = normalizeRoomCode(query.get('room'))
  ?? normalizeRoomCode(sessionStorage.getItem('corner-horror-corridor-room'))
  ?? createRoomCode();
sessionStorage.setItem('corner-horror-corridor-room', roomCode);

function setObjective(label: string, complete = false) {
  objectiveEl.classList.toggle('complete', complete);
  objectiveBoxEl.textContent = complete ? '■' : '□';
  objectiveLabelEl.textContent = complete ? `${label}(完成)` : label;
}

function send(message: object) {
  if (ws?.readyState === WebSocket.OPEN) ws.send(JSON.stringify(message));
}

function syncControllerState() {
  const message: ProtoControllerStateMsg = {
    type: 'proto-controller-state',
    slots: ['completeFirefighterGear', null, null, null, null, null, null, null, null, null, null, null],
    inventoryOpen: false,
    paused: false,
  };
  send(message);
}

function vibrate(pattern: number | number[]) {
  send({ type: 'proto-vibrate', pattern });
}

function equipGear() {
  if (gearEquipped) return;
  gearEquipped = true;
  document.body.classList.add('gear-equipped');
  setObjective('穿上消防裝備', true);
  vibrate([45, 35, 90]);
  window.setTimeout(() => setObjective('抵達樓梯間'), 3000);
  syncControllerState();
}

function completeCorridorObjective() {
  if (objectiveCompleted) return;
  objectiveCompleted = true;
  setObjective('抵達樓梯間', true);
  vibrate(90);
}

async function showQr() {
  const configuredController = import.meta.env.VITE_CONTROLLER_URL?.trim();
  const base = configuredController || REMOTE_CONTROLLER_BASE;
  const url = new URL('controller-prototype.html', base.endsWith('/') ? base : `${base}/`);
  url.searchParams.set('room', roomCode);
  url.searchParams.set('v', import.meta.env.VITE_CONTROLLER_VERSION?.trim() || 'corridor-model-1');
  await QRCode.toCanvas(qrCanvasEl, url.toString(), {
    width: 244,
    margin: 1,
    errorCorrectionLevel: 'M',
    color: { dark: '#000000', light: '#ffffff' },
  });
}

function setPairingStatus(message: string) {
  pairingStatusEl.textContent = message;
}

function connectController() {
  if (!reconnectEnabled || ws?.readyState === WebSocket.OPEN || ws?.readyState === WebSocket.CONNECTING) return;
  const endpoint = import.meta.env.VITE_WS_URL?.trim() || REMOTE_RELAY;
  const socket = new WebSocket(buildWebSocketUrl(roomCode, endpoint, location.href));
  ws = socket;
  socket.addEventListener('open', () => {
    socket.send(JSON.stringify({ type: 'hello', role: 'host' }));
    setPairingStatus('等待手機連線');
  });
  socket.addEventListener('message', (event) => {
    const message = parseMessage(event.data);
    if (!message) return;
    if (message.type === 'kick') {
      reconnectEnabled = false;
      setPairingStatus('另一個預覽視窗已接管連線');
      socket.close();
      return;
    }
    if (message.type === 'status') {
      controllerConnected = message.controller;
      document.body.classList.toggle('pairing', !skipPairing && !controllerConnected);
      setPairingStatus(controllerConnected ? '手機已連線' : '等待手機連線');
      if (controllerConnected) syncControllerState();
    }
    if (message.type === 'ready') {
      controllerConnected = true;
      document.body.classList.remove('pairing');
      syncControllerState();
    }
    if (message.type === 'proto-move') phoneMove = { x: message.x, y: message.y };
    if (message.type === 'proto-pointer') phoneLook = { x: message.x, y: message.y };
    if (message.type === 'proto-navigate') {
      if (message.direction === 'left') pose.yaw = normalizeAngle(pose.yaw + Math.PI / 7);
      if (message.direction === 'right') pose.yaw = normalizeAngle(pose.yaw - Math.PI / 7);
      if (message.direction === 'forward' || message.direction === 'back') {
        navigationPulse = message.direction === 'forward' ? 1 : -1;
        navigationPulseUntil = performance.now() + 360;
      }
    }
    if (
      message.type === 'proto-item-action'
      && message.item === 'completeFirefighterGear'
      && message.action === 'use'
    ) equipGear();
  });
  socket.addEventListener('close', () => {
    if (ws === socket) ws = null;
    controllerConnected = false;
    phoneMove = { x: 0, y: 0 };
    if (!skipPairing) document.body.classList.add('pairing');
    if (!reconnectEnabled) return;
    if (reconnectTimer !== null) window.clearTimeout(reconnectTimer);
    reconnectTimer = window.setTimeout(connectController, 1800);
  });
  socket.addEventListener('error', () => setPairingStatus('連線中，請留在此頁'));
}

const keys = new Set<string>();
window.addEventListener('keydown', (event) => {
  keys.add(event.code);
  if (event.code === 'KeyE') equipGear();
});
window.addEventListener('keyup', (event) => keys.delete(event.code));
window.addEventListener('blur', () => keys.clear());
window.addEventListener('pointermove', (event) => {
  mouseLook = {
    x: event.clientX / window.innerWidth * 2 - 1,
    y: 1 - event.clientY / window.innerHeight * 2,
  };
});
desktopEquip?.addEventListener('click', equipGear);

function updateInputs(now: number) {
  const keyboardForward = (keys.has('KeyW') || keys.has('ArrowUp') ? 1 : 0)
    - (keys.has('KeyS') || keys.has('ArrowDown') ? 1 : 0);
  const keyboardTurn = (keys.has('KeyD') || keys.has('ArrowRight') ? 1 : 0)
    - (keys.has('KeyA') || keys.has('ArrowLeft') ? 1 : 0);
  const pulse = now < navigationPulseUntil ? navigationPulse : 0;
  movement = {
    forward: THREE.MathUtils.clamp(keyboardForward - phoneMove.y + pulse, -1, 1),
    turn: THREE.MathUtils.clamp(keyboardTurn + phoneMove.x, -1, 1),
  };
}

const clock = new THREE.Clock();
let elapsed = 0;
function render() {
  const delta = Math.min(clock.getDelta(), 0.05);
  elapsed += delta;
  updateInputs(performance.now());

  const allowedBounds = gearEquipped ? fullBounds : { ...fullBounds, minZ: 0.55 };
  const previous = pose;
  pose = resolveCorridorObstacles(
    advanceCorridorPose(pose, movement, delta, allowedBounds),
    PLAYER_RADIUS,
    fireHoseStation.obstacles,
    allowedBounds,
  );
  const moved = Math.hypot(pose.x - previous.x, pose.z - previous.z);
  const lookSource = controllerConnected ? phoneLook : mouseLook;
  const headYaw = THREE.MathUtils.clamp(lookSource.x * 0.23, -0.23, 0.23);
  const headPitch = THREE.MathUtils.clamp(lookSource.y * 0.34 - 0.035, -0.24, 0.31);
  const walkingBob = moved > 0.0001 ? Math.sin(elapsed * 8.4) * 0.012 : 0;

  bodyRig.position.set(pose.x, 0, pose.z);
  bodyRig.rotation.y = pose.yaw;
  headRig.position.y = 1.61 + walkingBob;
  headRig.rotation.set(headPitch, headYaw, 0);

  const lookingHigh = gearEquipped && lookSource.y > 0.34;
  highLookDuration = THREE.MathUtils.clamp(
    highLookDuration + delta * (lookingHigh ? 1 : -1.8),
    0,
    2.2,
  );
  const danger = THREE.MathUtils.smoothstep(highLookDuration, 0.35, 1.35);
  document.documentElement.style.setProperty('--condensation', danger.toFixed(3));
  document.documentElement.style.setProperty('--hypoxia', (danger * 0.72).toFixed(3));
  document.body.dataset.condensation = danger.toFixed(3);
  if (danger > 0.45 && performance.now() - lastWarningVibration > 720) {
    lastWarningVibration = performance.now();
    vibrate(Math.round(26 + danger * 70));
  }

  for (const cloud of smokeClouds) {
    cloud.sprite.position.x = cloud.baseX + Math.sin(elapsed * cloud.speed + cloud.phase) * 0.18;
    cloud.sprite.position.y = cloud.baseY + Math.cos(elapsed * cloud.speed * 0.7 + cloud.phase) * 0.045;
  }
  updateBloodDrip(elapsed);

  if (gearEquipped && pose.z <= -20.7) completeCorridorObjective();
  document.body.dataset.playerX = pose.x.toFixed(3);
  document.body.dataset.playerZ = pose.z.toFixed(3);
  document.body.dataset.playerYaw = pose.yaw.toFixed(3);
  renderer.render(scene, camera);
  requestAnimationFrame(render);
}

window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.6));
  renderer.setSize(window.innerWidth, window.innerHeight);
});

document.body.dataset.modelReady = 'true';
document.body.dataset.geometryCount = String(geometryCount);
document.body.dataset.doorCount = String(doorCount);
document.body.dataset.bloodReady = 'true';
document.body.classList.toggle('debug-preview', skipPairing);
document.body.classList.toggle('pairing', !skipPairing);
if (autoEquip) equipGear();
void showQr().catch(() => setPairingStatus('QR Code 產生失敗'));
connectController();
requestAnimationFrame(() => document.body.classList.add('scene-ready'));
render();
