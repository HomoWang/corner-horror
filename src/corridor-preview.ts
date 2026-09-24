import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import QRCode from 'qrcode';
import { parseMessage, type ProtoControllerStateMsg } from './shared/protocol';
import { buildWebSocketUrl, createRoomCode, normalizeRoomCode } from './shared/session';
import { advanceCorridorPose, normalizeAngle, resolveCorridorObstacles, type CorridorPose } from './corridor-motion';
import { addFireHoseStation } from './corridor-fire-hose';
import { loadSave, writeSave } from './shared/persistence';
import {
  completeChapterTwoTrigger,
  corridorHighLookLimit,
  createChapterTwoStartState,
  hasChapterTwoTrigger,
  shouldTriggerHypoxiaDeath,
  type ChapterTwoSaveState,
  type ChapterTwoTriggerId,
} from './chapter-two';
import {
  clearSaveSlot,
  createEmptySaveArchive,
  gameSaveTitle,
  normalizeSaveArchive,
  writeSaveSlot,
  type ChapterTwoSaveRecord,
  type GameSaveArchive,
  type GameSaveRecord,
} from './prototype/save-system';
import './corridor-preview.css';

const host = document.querySelector<HTMLElement>('#corridor-preview');
const objective = document.querySelector<HTMLElement>('#story-objective');
const objectiveBox = objective?.querySelector<HTMLElement>('.objective-box');
const objectiveLabel = objective?.querySelector<HTMLElement>('.objective-label');
const qrCanvas = document.querySelector<HTMLCanvasElement>('#qr-code');
const pairingStatus = document.querySelector<HTMLElement>('#pairing-status');
const desktopEquip = document.querySelector<HTMLButtonElement>('#desktop-equip');
const notice = document.querySelector<HTMLElement>('#corridor-notice');
const subtitle = document.querySelector<HTMLElement>('#corridor-subtitle');
const interactionPrompt = document.querySelector<HTMLElement>('#interaction-prompt');
const crosshair = document.querySelector<HTMLElement>('#crosshair');
const keypadPanel = document.querySelector<HTMLElement>('#keypad-panel');
const keypadReadout = document.querySelector<HTMLElement>('#keypad-readout');
const pausePanel = document.querySelector<HTMLElement>('#corridor-pause');
const savePanel = document.querySelector<HTMLElement>('#corridor-save-panel');
const savePanelTitle = document.querySelector<HTMLElement>('#corridor-save-title');
const savePanelHelp = document.querySelector<HTMLElement>('#corridor-save-help');
const saveSlots = document.querySelector<HTMLElement>('#corridor-save-slots');
const deathPanel = document.querySelector<HTMLElement>('#corridor-death');
const ambienceAudio = document.querySelector<HTMLAudioElement>('#corridor-ambience');
const footstepsAudio = document.querySelector<HTMLAudioElement>('#corridor-footsteps');
const pendantAudio = document.querySelector<HTMLAudioElement>('#corridor-pendant');
const jumpscareAudio = document.querySelector<HTMLAudioElement>('#corridor-jumpscare-audio');

if (
  !host || !objective || !objectiveBox || !objectiveLabel || !qrCanvas || !pairingStatus ||
  !notice || !subtitle || !interactionPrompt || !crosshair || !keypadPanel ||
  !keypadReadout || !pausePanel || !savePanel || !savePanelTitle || !savePanelHelp ||
  !saveSlots || !deathPanel || !ambienceAudio || !footstepsAudio || !pendantAudio ||
  !jumpscareAudio
) {
  throw new Error('Corridor preview UI is incomplete.');
}
const previewHost = host;
const objectiveEl = objective;
const objectiveBoxEl = objectiveBox;
const objectiveLabelEl = objectiveLabel;
const qrCanvasEl = qrCanvas;
const pairingStatusEl = pairingStatus;
const noticeEl = notice;
const subtitleEl = subtitle;
const interactionPromptEl = interactionPrompt;
const crosshairEl = crosshair;
const keypadPanelEl = keypadPanel;
const keypadReadoutEl = keypadReadout;
const pausePanelEl = pausePanel;
const savePanelEl = savePanel;
const savePanelTitleEl = savePanelTitle;
const savePanelHelpEl = savePanelHelp;
const saveSlotsEl = saveSlots;
const ambienceAudioEl = ambienceAudio;
const footstepsAudioEl = footstepsAudio;
const pendantAudioEl = pendantAudio;
const jumpscareAudioEl = jumpscareAudio;

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
addDoor(1, -13.35, '304', true);
addDoor(-1, -15.75, '303', true);

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

const cluePaperMaterial = new THREE.MeshStandardMaterial({
  color: 0x5c4c3f,
  roughness: 0.97,
  side: THREE.DoubleSide,
});
const halfPhoto = addMesh(
  new THREE.PlaneGeometry(0.22, 0.15),
  cluePaperMaterial,
  new THREE.Vector3(-1.05, 0.018, -7.28),
  new THREE.Euler(-Math.PI / 2, 0.08, -0.34),
);
halfPhoto.scale.x = 0.62;
const bentKey = addMesh(
  new THREE.TorusGeometry(0.045, 0.009, 9, 22, Math.PI * 1.75),
  dullMetalMaterial,
  new THREE.Vector3(-0.78, 0.035, -7.46),
  new THREE.Euler(Math.PI / 2, 0.2, 0.25),
);
bentKey.scale.set(1, 0.72, 1);

const midFireDoorPivot = new THREE.Group();
midFireDoorPivot.position.set(-CORRIDOR.halfWidth + 0.08, 0, -10.18);
const midFireDoorPanel = new THREE.Mesh(
  new RoundedBoxGeometry(CORRIDOR.halfWidth * 2 - 0.16, 2.48, 0.09, 5, 0.012),
  fireDoorMaterial,
);
midFireDoorPanel.position.set(CORRIDOR.halfWidth - 0.08, 1.24, 0);
midFireDoorPanel.castShadow = true;
midFireDoorPanel.receiveShadow = true;
midFireDoorPivot.add(midFireDoorPanel);
scene.add(midFireDoorPivot);
geometryCount += 1;
for (const x of [-1.42, 1.42]) {
  addMesh(
    new RoundedBoxGeometry(0.12, 2.58, 0.16, 4, 0.01),
    fireDoorFrameMaterial,
    new THREE.Vector3(x, 1.29, -10.18),
  );
}
addMesh(
  new RoundedBoxGeometry(3, 0.12, 0.16, 4, 0.01),
  fireDoorFrameMaterial,
  new THREE.Vector3(0, 2.54, -10.18),
);
const midDoorMechanism = addMesh(
  new RoundedBoxGeometry(0.28, 0.42, 0.12, 4, 0.012),
  fireDoorHardwareMaterial,
  new THREE.Vector3(1.18, 1.12, -10.09),
);
const midDoorHandleSocket = addMesh(
  new THREE.CylinderGeometry(0.045, 0.045, 0.11, 18),
  dullMetalMaterial,
  new THREE.Vector3(1.18, 1.12, -10.01),
  new THREE.Euler(Math.PI / 2, 0, 0),
);
midDoorMechanism.castShadow = midDoorHandleSocket.castShadow = false;

const fireHandleGroup = new THREE.Group();
const fireHandleGrip = new THREE.Mesh(
  new THREE.CylinderGeometry(0.025, 0.028, 0.36, 18),
  dullMetalMaterial,
);
fireHandleGrip.rotation.z = Math.PI / 2;
const fireHandleHub = new THREE.Mesh(
  new THREE.CylinderGeometry(0.052, 0.052, 0.035, 18),
  dullMetalMaterial,
);
fireHandleHub.rotation.x = Math.PI / 2;
fireHandleGroup.add(fireHandleGrip, fireHandleHub);
fireHandleGroup.position.set(0.78, 0.075, -9.48);
fireHandleGroup.rotation.y = -0.24;
scene.add(fireHandleGroup);
geometryCount += 2;

const keyCabinet = addMesh(
  new RoundedBoxGeometry(0.08, 0.72, 0.54, 4, 0.012),
  fireDoorFrameMaterial,
  new THREE.Vector3(CORRIDOR.halfWidth - 0.035, 1.35, -18.05),
);
const keyCabinetPanel = addMesh(
  new RoundedBoxGeometry(0.035, 0.26, 0.18, 4, 0.008),
  fireDoorHardwareMaterial,
  new THREE.Vector3(CORRIDOR.halfWidth - 0.095, 1.38, -18.05),
);
keyCabinet.castShadow = keyCabinetPanel.castShadow = false;

const silhouetteMaterial = new THREE.MeshBasicMaterial({ color: 0x020101 });
const charredSilhouette = new THREE.Group();
const silhouetteHead = new THREE.Mesh(new THREE.SphereGeometry(0.16, 20, 14), silhouetteMaterial);
silhouetteHead.position.y = 1.56;
const silhouetteTorso = new THREE.Mesh(new THREE.CapsuleGeometry(0.2, 0.82, 8, 16), silhouetteMaterial);
silhouetteTorso.position.y = 0.91;
charredSilhouette.add(silhouetteHead, silhouetteTorso);
charredSilhouette.visible = false;
scene.add(charredSilhouette);

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
const officialChapter = query.get('chapter') === '2';
let gearEquipped = officialChapter;
let objectiveCompleted = false;
let highLookDuration = 0;
let lastWarningVibration = 0;
let chapterState = createChapterTwoStartState();
let saveArchive: GameSaveArchive = createEmptySaveArchive();
let playtimeBaseMs = 0;
let playtimeStartedAt = performance.now();
let interactionHeld = false;
let interactionHoldStartedAt = 0;
let interactionTarget: CorridorInteraction | null = null;
let paused = false;
let dead = false;
let scripted = false;
let keypadCode = '';
let keypadSelection = 0;
let keypadOpen = false;
let saveMode: 'save' | 'load' = 'save';
let saveReturn: 'pause' | 'death' = 'pause';
let noticeTimer: number | null = null;
let subtitleTimer: number | null = null;
let fireDoorOpenAmount = 0;
let room307LookDuration = 0;
let room305AwaitingRetreat = false;
let lastDoorResistanceVibration = 0;
let room305CompletedAt = 0;
let awaitingTraumaTurn = false;
let traumaLookYaw = 0;
let audioUnlocked = false;
let controllerConnected = false;
let ws: WebSocket | null = null;
let reconnectTimer: number | null = null;
let reconnectEnabled = true;

const roomCode = normalizeRoomCode(query.get('room'))
  ?? normalizeRoomCode(sessionStorage.getItem('corner-horror-corridor-room'))
  ?? createRoomCode();
sessionStorage.setItem('corner-horror-corridor-room', roomCode);

type CorridorInteraction =
  | 'room307'
  | 'room305'
  | 'fireCabinet'
  | 'fireHandle'
  | 'midFireDoor'
  | 'room303'
  | 'keyCabinet'
  | 'stairDoor';

const interactionPoints: Record<CorridorInteraction, { x: number; z: number; radius: number; label: string }> = {
  room307: { x: -1.5, z: 0.35, radius: 1.25, label: '查看 307 房門' },
  room305: { x: -1.48, z: -5.1, radius: 1.3, label: '查看掉落門牌與門把' },
  fireCabinet: { x: 1.48, z: -9.25, radius: 1.35, label: '查看破裂消防箱' },
  fireHandle: { x: 0.78, z: -9.48, radius: 1.05, label: '拾起焦黑消防把手' },
  midFireDoor: { x: 0.9, z: -10.02, radius: 1.3, label: '持續操作門栓' },
  room303: { x: -1.48, z: -15.75, radius: 1.35, label: '使用 303 房門鑰匙' },
  keyCabinet: { x: 1.48, z: -18.05, radius: 1.25, label: '輸入房號' },
  stairDoor: { x: 0, z: -21.05, radius: 1.4, label: '將手掌貼上防火門' },
};

function setObjective(label: string, complete = false) {
  objectiveEl.classList.toggle('complete', complete);
  objectiveBoxEl.textContent = complete ? '■' : '□';
  objectiveLabelEl.textContent = complete ? `${label}(完成)` : label;
}

function wait(milliseconds: number): Promise<void> {
  return new Promise((resolve) => window.setTimeout(resolve, milliseconds));
}

function currentPlaytimeMs(): number {
  return Math.max(0, Math.round(playtimeBaseMs + (paused ? 0 : performance.now() - playtimeStartedAt)));
}

function showNotice(message: string, duration = 2600) {
  if (noticeTimer !== null) window.clearTimeout(noticeTimer);
  noticeEl.textContent = message;
  noticeEl.classList.add('show');
  noticeTimer = window.setTimeout(() => {
    noticeEl.classList.remove('show');
    noticeTimer = null;
  }, duration);
}

function showSubtitle(message: string, duration = 2600) {
  if (subtitleTimer !== null) window.clearTimeout(subtitleTimer);
  subtitleEl.textContent = message;
  subtitleEl.classList.add('show');
  subtitleTimer = window.setTimeout(() => {
    subtitleEl.classList.remove('show');
    subtitleTimer = null;
  }, duration);
}

function unlockAudio() {
  if (audioUnlocked) return;
  audioUnlocked = true;
  ambienceAudioEl.volume = 0.18;
  footstepsAudioEl.volume = 0.22;
  pendantAudioEl.volume = 0.34;
  jumpscareAudioEl.volume = 0.58;
  if (!paused && !dead) void ambienceAudioEl.play().catch(() => undefined);
}

function synthImpact(frequency = 110, duration = 0.13, gain = 0.08) {
  if (!audioUnlocked) return;
  const AudioContextClass = window.AudioContext;
  const context = new AudioContextClass();
  const oscillator = context.createOscillator();
  const volume = context.createGain();
  oscillator.type = 'sine';
  oscillator.frequency.setValueAtTime(frequency, context.currentTime);
  oscillator.frequency.exponentialRampToValueAtTime(Math.max(28, frequency * 0.35), context.currentTime + duration);
  volume.gain.setValueAtTime(gain, context.currentTime);
  volume.gain.exponentialRampToValueAtTime(0.0001, context.currentTime + duration);
  oscillator.connect(volume).connect(context.destination);
  oscillator.start();
  oscillator.stop(context.currentTime + duration);
  oscillator.addEventListener('ended', () => void context.close());
}

function completeTrigger(trigger: ChapterTwoTriggerId) {
  chapterState = completeChapterTwoTrigger(chapterState, trigger);
  document.body.dataset.chapterTrigger = trigger;
}

function makeChapterTwoRecord(): ChapterTwoSaveRecord {
  return {
    version: 1,
    chapter: 'chapter-2',
    checkpoint: 'chapter-2-start',
    savedAt: new Date().toISOString(),
    playtimeMs: currentPlaytimeMs(),
    state: {
      ...chapterState,
      pose: { ...pose },
      completedTriggers: [...chapterState.completedTriggers],
    },
  };
}

async function persistArchive() {
  await writeSave(saveArchive);
}

function applyChapterState(record: ChapterTwoSaveRecord) {
  chapterState = {
    ...record.state,
    pose: { ...record.state.pose },
    completedTriggers: [...record.state.completedTriggers],
  };
  pose = { ...record.state.pose };
  playtimeBaseMs = record.playtimeMs;
  playtimeStartedAt = performance.now();
  gearEquipped = true;
  document.body.classList.add('gear-equipped');
  fireHandleGroup.visible = !chapterState.fireHandleCollected;
  fireDoorOpenAmount = chapterState.fireDoorOpened ? 1 : 0;
  midFireDoorPivot.rotation.y = -Math.PI * 0.49 * fireDoorOpenAmount;
  objectiveCompleted = hasChapterTwoTrigger(chapterState, 'T14');
  setObjective('抵達樓梯間', objectiveCompleted);
}

async function ensureChapterCheckpoint() {
  const stored = await loadSave<GameSaveArchive>();
  saveArchive = normalizeSaveArchive(stored?.data);
  const pending = sessionStorage.getItem('room307-pending-load');
  const resume = query.get('resume');
  let record: GameSaveRecord | null = null;
  if (resume === 'pending' && pending === 'checkpoint') record = saveArchive.checkpoint;
  else if (resume === 'pending' && pending?.startsWith('slot:')) {
    const index = Number(pending.slice(5));
    record = Number.isInteger(index) ? saveArchive.slots[index] ?? null : null;
  } else if (resume === 'checkpoint') record = saveArchive.checkpoint;
  sessionStorage.removeItem('room307-pending-load');

  if (record?.chapter === 'chapter-1') {
    const roomUrl = new URL('prototype.html', location.href);
    roomUrl.searchParams.set('room', roomCode);
    roomUrl.searchParams.set('restart', 'load');
    location.replace(roomUrl.toString());
    return;
  }
  if (record?.chapter === 'chapter-2') applyChapterState(record);
  else {
    chapterState = createChapterTwoStartState();
    gearEquipped = officialChapter || autoEquip;
    if (gearEquipped) document.body.classList.add('gear-equipped');
  }

  if (!saveArchive.checkpoint || saveArchive.checkpoint.chapter !== 'chapter-2') {
    const startRecord: ChapterTwoSaveRecord = {
      version: 1,
      chapter: 'chapter-2',
      checkpoint: 'chapter-2-start',
      savedAt: new Date().toISOString(),
      playtimeMs: currentPlaytimeMs(),
      state: createChapterTwoStartState(),
    };
    saveArchive = { ...saveArchive, checkpoint: startRecord };
    await persistArchive();
  }
}

function formatPlaytime(milliseconds: number): string {
  const minutes = Math.max(0, Math.floor(milliseconds / 60000));
  return minutes >= 60 ? `${Math.floor(minutes / 60)} 小時 ${minutes % 60} 分` : `${minutes} 分鐘`;
}

function renderSaveSlots() {
  saveSlotsEl.replaceChildren();
  saveArchive.slots.forEach((record, index) => {
    const row = document.createElement('div');
    row.className = 'save-slot-row';
    const slot = document.createElement('button');
    slot.type = 'button';
    slot.dataset.slot = String(index);
    slot.textContent = record
      ? `${String(index + 1).padStart(2, '0')}　${gameSaveTitle(record)}　${formatPlaytime(record.playtimeMs)}`
      : `${String(index + 1).padStart(2, '0')}　空白存檔`;
    slot.disabled = saveMode === 'load' && !record;
    const remove = document.createElement('button');
    remove.type = 'button';
    remove.dataset.deleteSlot = String(index);
    remove.textContent = '刪除';
    remove.disabled = !record;
    row.append(slot, remove);
    saveSlotsEl.append(row);
  });
}

function openSavePanel(mode: 'save' | 'load', from: 'pause' | 'death') {
  saveMode = mode;
  saveReturn = from;
  pausePanelEl.classList.remove('open');
  document.body.classList.remove('corridor-dead');
  savePanelTitleEl.textContent = mode === 'save' ? '儲存遊戲' : '讀取存檔';
  savePanelHelpEl.textContent = mode === 'save' ? '點擊舊檔可直接覆蓋。' : '選擇要讀取的進度。';
  renderSaveSlots();
  savePanelEl.classList.add('open');
}

function closeSavePanel() {
  savePanelEl.classList.remove('open');
  if (saveReturn === 'death') document.body.classList.add('corridor-dead');
  else pausePanelEl.classList.add('open');
}

async function saveToSlot(index: number) {
  const record = makeChapterTwoRecord();
  saveArchive = writeSaveSlot(saveArchive, index, record);
  await persistArchive();
  renderSaveSlots();
  savePanelHelpEl.textContent = `已儲存至存檔 ${index + 1}。`;
}

function navigateToRecord(record: GameSaveRecord, source: string) {
  sessionStorage.setItem('room307-pending-load', source);
  if (record.chapter === 'chapter-1') {
    const roomUrl = new URL('prototype.html', location.href);
    roomUrl.searchParams.set('room', roomCode);
    roomUrl.searchParams.set('restart', 'load');
    location.replace(roomUrl.toString());
    return;
  }
  const corridorUrl = new URL('corridor-3d-preview.html', location.href);
  corridorUrl.searchParams.set('room', roomCode);
  corridorUrl.searchParams.set('chapter', '2');
  corridorUrl.searchParams.set('resume', 'pending');
  location.replace(corridorUrl.toString());
}

function loadSlot(index: number) {
  const record = saveArchive.slots[index];
  if (!record) return;
  navigateToRecord(record, `slot:${index}`);
}

async function deleteSlot(index: number) {
  if (!saveArchive.slots[index]) return;
  saveArchive = clearSaveSlot(saveArchive, index);
  await persistArchive();
  renderSaveSlots();
}

function restartChapter() {
  const record = saveArchive.checkpoint;
  if (record?.chapter === 'chapter-2') navigateToRecord(record, 'checkpoint');
}

async function closeGame() {
  reconnectEnabled = false;
  if (window.room307Desktop) {
    await window.room307Desktop.closeGame().catch(() => false);
    return;
  }
  window.close();
}

function setPaused(next: boolean) {
  if (dead || scripted || keypadOpen) return;
  if (paused === next) return;
  if (next) {
    playtimeBaseMs = currentPlaytimeMs();
    paused = true;
    movement = { forward: 0, turn: 0 };
    footstepsAudioEl.pause();
    ambienceAudioEl.pause();
    pausePanelEl.classList.add('open');
    document.body.classList.add('corridor-paused');
  } else {
    pausePanelEl.classList.remove('open');
    savePanelEl.classList.remove('open');
    paused = false;
    playtimeStartedAt = performance.now();
    document.body.classList.remove('corridor-paused');
    if (audioUnlocked) void ambienceAudioEl.play().catch(() => undefined);
  }
  syncControllerState();
}

function send(message: object) {
  if (ws?.readyState === WebSocket.OPEN) ws.send(JSON.stringify(message));
}

function syncControllerState() {
  const message: ProtoControllerStateMsg = {
    type: 'proto-controller-state',
    slots: ['completeFirefighterGear', null, null, null, null, null, null, null, null, null, null, null],
    inventoryOpen: false,
    paused: paused || dead || scripted || keypadOpen,
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

function interactionAvailable(id: CorridorInteraction): boolean {
  if (id === 'room307') return !hasChapterTwoTrigger(chapterState, 'T02');
  if (id === 'room305') return !hasChapterTwoTrigger(chapterState, 'T03') && !room305AwaitingRetreat;
  if (id === 'fireCabinet') return !hasChapterTwoTrigger(chapterState, 'T05');
  if (id === 'fireHandle') return hasChapterTwoTrigger(chapterState, 'T05') && !chapterState.fireHandleCollected;
  if (id === 'midFireDoor') return chapterState.fireHandleCollected && !chapterState.fireDoorOpened;
  if (id === 'keyCabinet') return hasChapterTwoTrigger(chapterState, 'T10') && !hasChapterTwoTrigger(chapterState, 'T11');
  if (id === 'room303') return hasChapterTwoTrigger(chapterState, 'T12') && chapterState.room303KeyCollected && !hasChapterTwoTrigger(chapterState, 'T13');
  if (id === 'stairDoor') return hasChapterTwoTrigger(chapterState, 'T13') && !hasChapterTwoTrigger(chapterState, 'T14');
  return false;
}

function findInteractionTarget(): CorridorInteraction | null {
  if (paused || dead || scripted || keypadOpen) return null;
  const forwardX = -Math.sin(pose.yaw);
  const forwardZ = -Math.cos(pose.yaw);
  let best: { id: CorridorInteraction; distance: number } | null = null;
  for (const [id, point] of Object.entries(interactionPoints) as Array<[
    CorridorInteraction,
    (typeof interactionPoints)[CorridorInteraction],
  ]>) {
    if (!interactionAvailable(id)) continue;
    const dx = point.x - pose.x;
    const dz = point.z - pose.z;
    const distance = Math.hypot(dx, dz);
    if (distance > point.radius) continue;
    const facing = distance < 0.001 ? 1 : (dx * forwardX + dz * forwardZ) / distance;
    if (facing < 0.48) continue;
    if (!best || distance < best.distance) best = { id, distance };
  }
  return best?.id ?? null;
}

function updateInteractionPrompt() {
  interactionTarget = findInteractionTarget();
  const point = interactionTarget ? interactionPoints[interactionTarget] : null;
  interactionPromptEl.textContent = point?.label ?? '';
  interactionPromptEl.classList.toggle('show', Boolean(point));
  crosshairEl.classList.toggle('active', Boolean(point));
}

async function playRoom307Memory() {
  scripted = true;
  movement = { forward: 0, turn: 0 };
  showNotice('門外傳來熟悉的沉重靴聲。', 2100);
  synthImpact(74, 0.2, 0.1);
  await wait(850);
  synthImpact(62, 0.22, 0.12);
  await wait(540);
  synthImpact(58, 0.24, 0.13);
  showSubtitle('祈望：商禾！', 1500);
  vibrate([60, 75, 110]);
  await wait(1350);
  completeTrigger('T02');
  showNotice('門開啟的瞬間，記憶又斷了。', 1900);
  scripted = false;
}

async function inspectRoom305() {
  scripted = true;
  synthImpact(190, 0.08, 0.035);
  showNotice('305。門牌掉在地上，門框因高溫變形，已經卡死。', 3100);
  vibrate(24);
  await wait(1500);
  synthImpact(150, 0.11, 0.04);
  await wait(650);
  room305AwaitingRetreat = true;
  showNotice('門完全卡死。', 1500);
  scripted = false;
}

function revealEscapeClues() {
  completeTrigger('T04');
  showNotice('煙灰手印一路延伸。燒焦鞋旁的半張照片只剩：「三樓……」「……等我回來」', 4400);
}

function inspectFireCabinet() {
  completeTrigger('T05');
  showNotice('玻璃已破，滅火器不見了。被拉出的水帶有數處燒穿。', 3600);
  vibrate(26);
}

function collectFireHandle() {
  chapterState = { ...chapterState, fireHandleCollected: true };
  fireHandleGroup.visible = false;
  showNotice('取得焦黑的金屬消防把手。', 2200);
  vibrate([30, 35, 55]);
}

async function openMidFireDoor() {
  if (chapterState.fireDoorOpened || scripted) return;
  scripted = true;
  synthImpact(54, 0.75, 0.12);
  showNotice('門栓正在緩慢解除。', 2500);
  await wait(1550);
  chapterState = { ...chapterState, fireDoorOpened: true };
  completeTrigger('T06');
  vibrate([80, 45, 160]);
  showNotice('防火隔門打開了。聲音傳進走廊深處，沒有任何回應。', 3400);
  await wait(1700);
  scripted = false;
}

function openKeypad() {
  keypadOpen = true;
  keypadCode = '';
  keypadSelection = 0;
  keypadReadoutEl.textContent = '---';
  document.body.classList.add('keypad-open');
  updateKeypadSelection();
  syncControllerState();
}

function closeKeypad() {
  keypadOpen = false;
  keypadCode = '';
  document.body.classList.remove('keypad-open');
  syncControllerState();
}

function updateKeypadSelection() {
  const buttons = [...keypadPanelEl.querySelectorAll<HTMLButtonElement>('[data-keypad]')];
  buttons.forEach((button, index) => button.classList.toggle('selected', index === keypadSelection));
}

function pressKeypad(value: string) {
  if (value === 'back') {
    closeKeypad();
    return;
  }
  if (value === 'clear') keypadCode = '';
  else if (/^\d$/.test(value) && keypadCode.length < 3) keypadCode += value;
  keypadReadoutEl.textContent = keypadCode.padEnd(3, '-');
  synthImpact(420, 0.045, 0.025);
  if (keypadCode.length !== 3) return;
  if (keypadCode !== '304') {
    keypadCode = '';
    keypadReadoutEl.textContent = '錯誤';
    vibrate([90, 80, 90]);
    window.setTimeout(() => { keypadReadoutEl.textContent = '---'; }, 650);
    return;
  }
  chapterState = { ...chapterState, room303KeyCollected: true };
  completeTrigger('T11');
  keypadReadoutEl.textContent = '開啟';
  vibrate(70);
  window.setTimeout(() => {
    closeKeypad();
    showNotice('壁櫃打開了。裡面是一把標有 303 的燒黑房門鑰匙。', 3600);
  }, 520);
}

async function playReturningFigure() {
  if (scripted || hasChapterTwoTrigger(chapterState, 'T12')) return;
  scripted = true;
  movement = { forward: 0, turn: 0 };
  const positions = [-8.2, -11.35, -14.35];
  for (const [index, z] of positions.entries()) {
    document.body.classList.add('figure-blackout');
    await wait(index === 0 ? 950 : 620);
    charredSilhouette.position.set(0, 0, z);
    charredSilhouette.visible = true;
    emergencyLight.intensity = 13;
    document.body.classList.remove('figure-blackout');
    vibrate(18);
    await wait(520);
    charredSilhouette.visible = false;
    emergencyLight.intensity = 0;
  }
  completeTrigger('T12');
  scripted = false;
}

async function playRoom303Knocks() {
  if (scripted || hasChapterTwoTrigger(chapterState, 'T10')) return;
  scripted = true;
  movement = { forward: 0, turn: 0 };
  for (let index = 0; index < 3; index += 1) {
    synthImpact(68, 0.18, 0.11);
    vibrate(34);
    await wait(520);
  }
  showNotice('門鎖住了。地上的燒焦紙條只剩：「門打不開。」', 3600);
  await wait(1500);
  completeTrigger('T10');
  scripted = false;
}

async function openRoom303Trauma() {
  scripted = true;
  synthImpact(82, 0.22, 0.08);
  document.body.classList.add('trauma-room');
  showNotice('門內只有燒毀牆面與密集抓痕。', 2400);
  await wait(2700);
  showSubtitle('身後傳來一次很近的呼吸。', 2400);
  document.body.classList.remove('trauma-room');
  traumaLookYaw = pose.yaw;
  awaitingTraumaTurn = true;
  scripted = false;
}

async function triggerTraumaJumpscare() {
  awaitingTraumaTurn = false;
  scripted = true;
  document.body.classList.add('trauma-jump');
  vibrate(360);
  if (audioUnlocked) {
    jumpscareAudioEl.currentTime = 0;
    void jumpscareAudioEl.play().catch(() => undefined);
  }
  await wait(760);
  document.body.classList.remove('trauma-jump');
  completeTrigger('T13');
  chapterState = { ...chapterState, room303KeyCollected: false };
  showNotice('回過神時，303 仍是關閉卡死的狀態。鑰匙也不見了。', 3600);
  scripted = false;
}

async function finishChapterTwo() {
  scripted = true;
  completeTrigger('T14');
  completeCorridorObjective();
  showNotice('門不燙。樓梯間的冷空氣從縫隙滲了進來。', 2600);
  saveArchive = { ...saveArchive, checkpoint: makeChapterTwoRecord() };
  await persistArchive();
  await wait(2800);
  showNotice('第二章完成', 10000);
}

function handleInteraction() {
  if (keypadOpen) {
    const button = [...keypadPanelEl.querySelectorAll<HTMLButtonElement>('[data-keypad]')][keypadSelection];
    if (button) pressKeypad(button.dataset.keypad ?? '');
    return;
  }
  if (!interactionTarget || paused || dead || scripted) return;
  unlockAudio();
  if (interactionTarget === 'room307') void playRoom307Memory();
  else if (interactionTarget === 'room305') void inspectRoom305();
  else if (interactionTarget === 'fireCabinet') inspectFireCabinet();
  else if (interactionTarget === 'fireHandle') collectFireHandle();
  else if (interactionTarget === 'keyCabinet') openKeypad();
  else if (interactionTarget === 'room303') void openRoom303Trauma();
  else if (interactionTarget === 'stairDoor') void finishChapterTwo();
}

async function startHypoxiaDeath() {
  if (dead) return;
  dead = true;
  scripted = true;
  movement = { forward: 0, turn: 0 };
  interactionHeld = false;
  footstepsAudioEl.pause();
  ambienceAudioEl.pause();
  document.documentElement.style.setProperty('--hypoxia', '1');
  vibrate([100, 80, 160, 70, 260]);
  await wait(950);
  document.body.classList.add('corridor-dead');
  syncControllerState();
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
      if (controllerConnected) {
        unlockAudio();
        syncControllerState();
      }
    }
    if (message.type === 'ready') {
      controllerConnected = true;
      document.body.classList.remove('pairing');
      unlockAudio();
      syncControllerState();
    }
    if (message.type === 'proto-move') phoneMove = { x: message.x, y: message.y };
    if (message.type === 'proto-pointer') phoneLook = { x: message.x, y: message.y };
    if (message.type === 'proto-interact') handleInteraction();
    if (message.type === 'proto-use') {
      interactionHeld = message.pressed;
      if (message.pressed) {
        interactionHoldStartedAt = performance.now();
        if (interactionTarget !== 'midFireDoor') handleInteraction();
      }
    }
    if (message.type === 'proto-pause') setPaused(!paused);
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
  if (event.code === 'Space' || event.code === 'KeyF') {
    interactionHeld = true;
    interactionHoldStartedAt = performance.now();
    if (interactionTarget !== 'midFireDoor') handleInteraction();
  }
  if (event.code === 'Escape' || event.code === 'KeyP') setPaused(!paused);
});
window.addEventListener('keyup', (event) => {
  keys.delete(event.code);
  if (event.code === 'Space' || event.code === 'KeyF') interactionHeld = false;
});
window.addEventListener('blur', () => keys.clear());
window.addEventListener('pointermove', (event) => {
  mouseLook = {
    x: event.clientX / window.innerWidth * 2 - 1,
    y: 1 - event.clientY / window.innerHeight * 2,
  };
});
desktopEquip?.addEventListener('click', equipGear);
window.addEventListener('pointerdown', unlockAudio, { once: true });

function updateInputs(now: number) {
  if (paused || dead || scripted || keypadOpen) {
    movement = { forward: 0, turn: 0 };
    return;
  }
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

  const allowedBounds = !gearEquipped
    ? { ...fullBounds, minZ: 0.55 }
    : chapterState.fireDoorOpened
      ? fullBounds
      : { ...fullBounds, minZ: -9.76 };
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

  if (keypadOpen) {
    const column = Math.max(0, Math.min(2, Math.floor((phoneLook.x + 1) * 1.5)));
    const row = Math.max(0, Math.min(3, Math.floor((1 - phoneLook.y) * 2)));
    const nextSelection = row * 3 + column;
    if (nextSelection !== keypadSelection) {
      keypadSelection = nextSelection;
      updateKeypadSelection();
    }
  }

  if (audioUnlocked && !paused && !dead && !scripted && moved > 0.0001) {
    if (footstepsAudioEl.paused) void footstepsAudioEl.play().catch(() => undefined);
  } else if (!footstepsAudioEl.paused) {
    footstepsAudioEl.pause();
  }

  const lookingHigh = gearEquipped && lookSource.y > 0.34;
  highLookDuration = THREE.MathUtils.clamp(
    highLookDuration + delta * (lookingHigh ? 1 : -1.8),
    0,
    2.6,
  );
  const highLookLimit = corridorHighLookLimit(pose.z);
  const danger = THREE.MathUtils.smoothstep(highLookDuration, highLookLimit * 0.35, highLookLimit + 0.35);
  document.documentElement.style.setProperty('--condensation', danger.toFixed(3));
  document.documentElement.style.setProperty('--hypoxia', (danger * 0.72).toFixed(3));
  document.body.dataset.condensation = danger.toFixed(3);
  if (danger > 0.45 && performance.now() - lastWarningVibration > 720) {
    lastWarningVibration = performance.now();
    vibrate(Math.round(26 + danger * 70));
  }
  if (!dead && shouldTriggerHypoxiaDeath(highLookDuration, pose.z)) void startHypoxiaDeath();

  for (const cloud of smokeClouds) {
    cloud.sprite.position.x = cloud.baseX + Math.sin(elapsed * cloud.speed + cloud.phase) * 0.18;
    cloud.sprite.position.y = cloud.baseY + Math.cos(elapsed * cloud.speed * 0.7 + cloud.phase) * 0.045;
  }
  updateBloodDrip(elapsed);

  if (chapterState.fireDoorOpened && fireDoorOpenAmount < 1) {
    fireDoorOpenAmount = Math.min(1, fireDoorOpenAmount + delta * 0.42);
  }
  midFireDoorPivot.rotation.y = -Math.PI * 0.49 * fireDoorOpenAmount;

  updateInteractionPrompt();
  room307LookDuration = interactionTarget === 'room307'
    ? room307LookDuration + delta
    : 0;
  if (room307LookDuration >= 0.65) {
    room307LookDuration = 0;
    void playRoom307Memory();
  }
  if (
    interactionHeld &&
    interactionTarget === 'midFireDoor' &&
    performance.now() - interactionHoldStartedAt >= 1150
  ) {
    interactionHeld = false;
    void openMidFireDoor();
  }
  if (
    interactionHeld &&
    interactionTarget === 'midFireDoor' &&
    performance.now() - lastDoorResistanceVibration >= 240
  ) {
    lastDoorResistanceVibration = performance.now();
    vibrate(30);
  }

  if (
    room305AwaitingRetreat &&
    Math.hypot(pose.x - interactionPoints.room305.x, pose.z - interactionPoints.room305.z) > 2.15
  ) {
    room305AwaitingRetreat = false;
    synthImpact(148, 0.11, 0.045);
    completeTrigger('T03');
    room305CompletedAt = performance.now();
    showNotice('身後的門把自己轉動了一次。門沒有打開。', 2600);
  }

  if (
    hasChapterTwoTrigger(chapterState, 'T03') &&
    !hasChapterTwoTrigger(chapterState, 'T04') &&
    pose.z < -6.65 &&
    (room305CompletedAt === 0 || performance.now() - room305CompletedAt > 1800)
  ) {
    revealEscapeClues();
  }
  if (chapterState.fireDoorOpened && !hasChapterTwoTrigger(chapterState, 'T07') && pose.z < -10.55) {
    completeTrigger('T07');
    showNotice('門後的煙更低、更濃。天花板已經坍落，裸線垂在水痕上方。', 3700);
  }
  if (
    hasChapterTwoTrigger(chapterState, 'T07') &&
    !hasChapterTwoTrigger(chapterState, 'T08') &&
    pose.z < -12.45 &&
    lookSource.y > 0.05
  ) {
    completeTrigger('T08');
    if (audioUnlocked) {
      pendantAudioEl.currentTime = 0;
      void pendantAudioEl.play().catch(() => undefined);
    }
    showSubtitle('商禾：你回不來的話，我就去把你帶回來。', 4200);
  }
  if (hasChapterTwoTrigger(chapterState, 'T08') && !hasChapterTwoTrigger(chapterState, 'T09') && pose.z < -13.55) {
    completeTrigger('T09');
    document.body.classList.remove('fire-memory');
    void document.body.offsetWidth;
    document.body.classList.add('fire-memory');
    vibrate(42);
    window.setTimeout(() => document.body.classList.remove('fire-memory'), 480);
  }
  if (hasChapterTwoTrigger(chapterState, 'T09') && !hasChapterTwoTrigger(chapterState, 'T10') && pose.z < -15.1) {
    void playRoom303Knocks();
  }
  if (
    hasChapterTwoTrigger(chapterState, 'T11') &&
    !hasChapterTwoTrigger(chapterState, 'T12') &&
    pose.z > -17.15 &&
    Math.cos(pose.yaw) < -0.2
  ) {
    void playReturningFigure();
  }
  if (awaitingTraumaTurn && Math.abs(normalizeAngle(pose.yaw - traumaLookYaw)) > 2.05) {
    void triggerTraumaJumpscare();
  }

  if (hasChapterTwoTrigger(chapterState, 'T13') && pose.z <= -20.7) {
    showNotice('樓梯間防火門就在前方。', 1400);
  }
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

keypadPanelEl.addEventListener('click', (event) => {
  const button = (event.target as HTMLElement).closest<HTMLButtonElement>('[data-keypad]');
  if (button) pressKeypad(button.dataset.keypad ?? '');
});

pausePanelEl.addEventListener('click', (event) => {
  const action = (event.target as HTMLElement).closest<HTMLElement>('[data-corridor-menu]')?.dataset.corridorMenu;
  if (action === 'resume') setPaused(false);
  else if (action === 'save') openSavePanel('save', 'pause');
  else if (action === 'load') openSavePanel('load', 'pause');
  else if (action === 'title') {
    const titleUrl = new URL('prototype.html', location.href);
    titleUrl.searchParams.set('room', roomCode);
    location.replace(titleUrl.toString());
  } else if (action === 'quit') void closeGame();
});

savePanelEl.addEventListener('click', (event) => {
  const element = event.target as HTMLElement;
  if (element.closest('[data-corridor-save-back]')) {
    closeSavePanel();
    return;
  }
  const remove = element.closest<HTMLElement>('[data-delete-slot]');
  if (remove) {
    void deleteSlot(Number(remove.dataset.deleteSlot));
    return;
  }
  const slot = element.closest<HTMLElement>('[data-slot]');
  if (!slot) return;
  const index = Number(slot.dataset.slot);
  if (saveMode === 'save') void saveToSlot(index);
  else loadSlot(index);
});

document.querySelector<HTMLElement>('#corridor-death')?.addEventListener('click', (event) => {
  const action = (event.target as HTMLElement).closest<HTMLElement>('[data-death]')?.dataset.death;
  if (action === 'restart') restartChapter();
  else if (action === 'load') openSavePanel('load', 'death');
  else if (action === 'quit') void closeGame();
});

document.body.dataset.modelReady = 'true';
document.body.dataset.geometryCount = String(geometryCount);
document.body.dataset.doorCount = String(doorCount);
document.body.dataset.bloodReady = 'true';
document.body.classList.toggle('debug-preview', skipPairing);
document.body.classList.toggle('pairing', !skipPairing);

async function initializeChapterTwo() {
  await ensureChapterCheckpoint();
  if (inspectMode && pose.z < -10.1) {
    chapterState = {
      ...chapterState,
      completedTriggers: ['T01', 'T02', 'T03', 'T04', 'T05', 'T06'],
      fireHandleCollected: true,
      fireDoorOpened: true,
    };
    fireHandleGroup.visible = false;
    fireDoorOpenAmount = 1;
    midFireDoorPivot.rotation.y = -Math.PI * 0.49;
    gearEquipped = true;
  }
  if (autoEquip && !gearEquipped) equipGear();
  if (gearEquipped) {
    document.body.classList.add('gear-equipped');
    setObjective('穿上消防裝備', true);
    window.setTimeout(() => {
      if (!objectiveCompleted) setObjective('抵達樓梯間');
    }, 3000);
  }
  void showQr().catch(() => setPairingStatus('QR Code 產生失敗'));
  connectController();
  window.setTimeout(() => document.body.classList.add('scene-ready'), officialChapter ? 1100 : 80);
  render();
}

void initializeChapterTwo();
