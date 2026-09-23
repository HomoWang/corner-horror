import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import type { CorridorObstacle } from './corridor-motion';

// Fire hose cabinet and the pulled-out, burnt-through lay-flat hose of the third-floor corridor (CH2-T05).
// The hose is swept as a flattened canvas tube: it rests on its flat face, drapes over the cabinet lip,
// and rounds up only where it meets the brass coupling.

export function seededRandom(seed: number) {
  let value = seed >>> 0;
  return () => {
    value = (value * 1664525 + 1013904223) >>> 0;
    return value / 0x1_0000_0000;
  };
}

export interface HoseControlPoint {
  position: THREE.Vector3;
  /** Preferred direction of the hose's flat face normal at this point (sign-agnostic). */
  up?: THREE.Vector3;
}

export interface HoseProfileSample {
  halfWidth: number;
  halfThickness: number;
  /** 0 = clean section, 1 = fully ragged burnt edge. */
  jag: number;
}

export interface FlatHoseOptions {
  points: HoseControlPoint[];
  samplesPerMeter?: number;
  radialSegments?: number;
  tileLength?: number;
  seed?: number;
  profile?: (s: number, length: number) => HoseProfileSample;
  /** Vertex tint multiplier; `downward` is 1 on the side facing the floor. */
  shade?: (s: number, length: number, downward: number) => [number, number, number];
}

export interface FlatHoseSample {
  position: THREE.Vector3;
  tangent: THREE.Vector3;
  normal: THREE.Vector3;
  binormal: THREE.Vector3;
  s: number;
  halfWidth: number;
  halfThickness: number;
}

const FLOOR_CLEARANCE = 0.0005;
const DEFAULT_PROFILE: HoseProfileSample = { halfWidth: 0.033, halfThickness: 0.0055, jag: 0 };

function wrapHalfTurn(angle: number): number {
  let wrapped = angle;
  while (wrapped > Math.PI / 2) wrapped -= Math.PI;
  while (wrapped <= -Math.PI / 2) wrapped += Math.PI;
  return wrapped;
}

/** Rounded flat cross-section: a superellipse wide along the binormal, thin along the normal. */
function crossSection(angle: number): [number, number] {
  const c = Math.cos(angle);
  const s = Math.sin(angle);
  const exponent = 2 / 2.7;
  return [Math.sign(c) * Math.abs(c) ** exponent, Math.sign(s) * Math.abs(s) ** exponent];
}

export function buildFlatHose(options: FlatHoseOptions) {
  const radialSegments = options.radialSegments ?? 14;
  const tileLength = options.tileLength ?? 0.08;
  const random = seededRandom(options.seed ?? 40);
  const curve = new THREE.CatmullRomCurve3(options.points.map((point) => point.position), false, 'centripetal');
  const length = curve.getLength();
  const count = Math.max(2, Math.ceil(length * (options.samplesPerMeter ?? 60))) + 1;

  const positions: THREE.Vector3[] = [];
  const profiles: HoseProfileSample[] = [];
  for (let index = 0; index < count; index += 1) {
    const s = (index / (count - 1)) * length;
    positions.push(curve.getPointAt(index / (count - 1)));
    profiles.push(options.profile?.(s, length) ?? DEFAULT_PROFILE);
  }

  const tangents = positions.map((_, index) => {
    const previous = positions[Math.max(0, index - 1)]!;
    const next = positions[Math.min(count - 1, index + 1)]!;
    return next.clone().sub(previous).normalize();
  });

  // Rotation-minimising frames (double reflection) keep the flat face from spinning on its own.
  const firstPinned = options.points.find((point) => point.up)?.up ?? new THREE.Vector3(0, 1, 0);
  const reference: THREE.Vector3[] = [];
  let r0 = firstPinned.clone().sub(tangents[0]!.clone().multiplyScalar(firstPinned.dot(tangents[0]!)));
  if (r0.lengthSq() < 1e-8) r0 = new THREE.Vector3(1, 0, 0).cross(tangents[0]!);
  reference.push(r0.normalize());
  for (let index = 0; index < count - 1; index += 1) {
    const r = reference[index]!;
    const t = tangents[index]!;
    const v1 = positions[index + 1]!.clone().sub(positions[index]!);
    const c1 = v1.dot(v1);
    if (c1 < 1e-12) {
      reference.push(r.clone());
      continue;
    }
    const rL = r.clone().sub(v1.clone().multiplyScalar((2 / c1) * v1.dot(r)));
    const tL = t.clone().sub(v1.clone().multiplyScalar((2 / c1) * v1.dot(t)));
    const v2 = tangents[index + 1]!.clone().sub(tL);
    const c2 = v2.dot(v2);
    const next = c2 < 1e-12 ? rL : rL.sub(v2.multiplyScalar((2 / c2) * v2.dot(rL)));
    reference.push(next.normalize());
  }

  // Pin the flat face to the requested directions, interpolating twist (mod 180°) in between.
  const pins: Array<{ index: number; angle: number }> = [];
  for (const point of options.points) {
    if (!point.up) continue;
    let nearest = 0;
    let nearestDistance = Infinity;
    positions.forEach((position, index) => {
      const distance = position.distanceToSquared(point.position);
      if (distance < nearestDistance) {
        nearestDistance = distance;
        nearest = index;
      }
    });
    const t = tangents[nearest]!;
    const r = reference[nearest]!;
    const up = point.up.clone().sub(t.clone().multiplyScalar(point.up.dot(t)));
    if (up.lengthSq() < 1e-8) continue;
    up.normalize();
    const angle = Math.atan2(t.dot(r.clone().cross(up)), r.dot(up));
    pins.push({ index: nearest, angle });
  }
  pins.sort((a, b) => a.index - b.index);
  for (let index = 0; index < pins.length; index += 1) {
    const pin = pins[index]!;
    pin.angle = index === 0 ? wrapHalfTurn(pin.angle) : pins[index - 1]!.angle + wrapHalfTurn(pin.angle - pins[index - 1]!.angle);
  }
  const twistAt = (index: number) => {
    if (pins.length === 0) return 0;
    if (index <= pins[0]!.index) return pins[0]!.angle;
    const last = pins[pins.length - 1]!;
    if (index >= last.index) return last.angle;
    for (let pin = 0; pin < pins.length - 1; pin += 1) {
      const a = pins[pin]!;
      const b = pins[pin + 1]!;
      if (index >= a.index && index <= b.index) {
        const mix = b.index === a.index ? 1 : (index - a.index) / (b.index - a.index);
        return THREE.MathUtils.lerp(a.angle, b.angle, mix);
      }
    }
    return last.angle;
  };

  const samples: FlatHoseSample[] = positions.map((position, index) => {
    const t = tangents[index]!;
    const r = reference[index]!;
    const angle = twistAt(index);
    const normal = r.clone().multiplyScalar(Math.cos(angle)).add(t.clone().cross(r).multiplyScalar(Math.sin(angle))).normalize();
    const binormal = t.clone().cross(normal).normalize();
    const profile = profiles[index]!;
    return {
      position: position.clone(),
      tangent: t.clone(),
      normal,
      binormal,
      s: (index / (count - 1)) * length,
      halfWidth: profile.halfWidth,
      halfThickness: profile.halfThickness,
    };
  });

  const vertexCount = count * (radialSegments + 1);
  const positionArray = new Float32Array(vertexCount * 3);
  const uvArray = new Float32Array(vertexCount * 2);
  const colorArray = new Float32Array(vertexCount * 3);
  const ring = new THREE.Vector3();
  samples.forEach((sample, index) => {
    const profile = profiles[index]!;
    // Rest any ring that would dip below the floor exactly on it.
    let lowest = Infinity;
    for (let j = 0; j < radialSegments; j += 1) {
      const [sx, sy] = crossSection((j / radialSegments) * Math.PI * 2);
      lowest = Math.min(lowest, sample.position.y + sample.binormal.y * sample.halfWidth * sx + sample.normal.y * sample.halfThickness * sy);
    }
    if (lowest < FLOOR_CLEARANCE) sample.position.y += FLOOR_CLEARANCE - lowest;

    for (let j = 0; j <= radialSegments; j += 1) {
      const [sx, sy] = crossSection((j / radialSegments) * Math.PI * 2);
      const ragged = profile.jag > 0 ? 1 - profile.jag * 0.5 * random() : 1;
      ring
        .copy(sample.binormal).multiplyScalar(sample.halfWidth * sx * ragged)
        .addScaledVector(sample.normal, sample.halfThickness * sy * ragged)
        .addScaledVector(sample.tangent, -profile.jag * 0.018 * random());
      const offsetY = ring.y;
      ring.add(sample.position);
      const vertex = index * (radialSegments + 1) + j;
      positionArray.set([ring.x, ring.y, ring.z], vertex * 3);
      uvArray.set([sample.s / tileLength, j / radialSegments], vertex * 2);
      const downward = THREE.MathUtils.clamp(-offsetY / Math.max(sample.halfThickness, 1e-4), 0, 1);
      const tint = options.shade?.(sample.s, length, downward) ?? [1, 1, 1];
      colorArray.set(tint, vertex * 3);
    }
  });

  const indices: number[] = [];
  for (let index = 0; index < count - 1; index += 1) {
    for (let j = 0; j < radialSegments; j += 1) {
      const a = index * (radialSegments + 1) + j;
      const b = (index + 1) * (radialSegments + 1) + j;
      indices.push(a, b, a + 1, b, b + 1, a + 1);
    }
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(positionArray, 3));
  geometry.setAttribute('uv', new THREE.BufferAttribute(uvArray, 2));
  geometry.setAttribute('color', new THREE.BufferAttribute(colorArray, 3));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  return { geometry, samples, length };
}

/** Soft dark ribbon under the floor-resting parts of the hose so it reads as lying on the wet floor. */
function buildContactShadow(samples: FlatHoseSample[], halfWidthScale: number) {
  const positions: number[] = [];
  const uvs: number[] = [];
  const colors: number[] = [];
  samples.forEach((sample) => {
    const across = new THREE.Vector3(-sample.tangent.z, 0, sample.tangent.x);
    if (across.lengthSq() < 1e-6) across.set(1, 0, 0);
    across.normalize().multiplyScalar(sample.halfWidth * halfWidthScale);
    const fade = 1 - THREE.MathUtils.smoothstep(sample.position.y, 0.012, 0.16);
    for (const side of [-1, 1]) {
      positions.push(sample.position.x + across.x * side, 0.0022, sample.position.z + across.z * side);
      uvs.push(sample.s, side < 0 ? 0 : 1);
      colors.push(1, 1, 1, fade);
    }
  });
  const indices: number[] = [];
  for (let index = 0; index < samples.length - 1; index += 1) {
    const a = index * 2;
    indices.push(a, a + 2, a + 1, a + 1, a + 2, a + 3);
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 4));
  geometry.setIndex(indices);
  return geometry;
}

// ---------------------------------------------------------------------------------------------
// Canvas textures

function canvasTexture(canvas: HTMLCanvasElement, anisotropy: number, color = true) {
  const texture = new THREE.CanvasTexture(canvas);
  if (color) texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = anisotropy;
  texture.minFilter = THREE.LinearMipmapLinearFilter;
  texture.magFilter = THREE.LinearFilter;
  return texture;
}

function context2d(canvas: HTMLCanvasElement) {
  const context = canvas.getContext('2d');
  if (!context) throw new Error('Canvas 2D is unavailable.');
  return context;
}

/**
 * Sooty bare-steel hardware (reel hub, bracket, bell...): the scanned rusty yellow-painted steel
 * (Poly Haven `rusty_metal_03`, CC0) recoloured so intact paint turns dark steel while the photographed
 * rust runs keep their real shape, then filmed with an even layer of soot.
 */
function drawRustHardware(canvas: HTMLCanvasElement, soot: number, photo?: HTMLImageElement) {
  const size = canvas.width;
  const context = context2d(canvas);
  if (photo) {
    context.drawImage(photo, 0, 0, size, size);
    const image = context.getImageData(0, 0, size, size);
    const data = image.data;
    for (let index = 0; index < data.length; index += 4) {
      const r = data[index]!;
      const g = data[index + 1]!;
      const b = data[index + 2]!;
      const luminance = (0.3 * r + 0.59 * g + 0.11 * b) / 150;
      const paintness = THREE.MathUtils.smoothstep(g / Math.max(r, 1), 0.52, 0.74);
      data[index] = THREE.MathUtils.lerp(r * 0.46, 44 * luminance, paintness);
      data[index + 1] = THREE.MathUtils.lerp(g * 0.4, 41 * luminance, paintness);
      data[index + 2] = THREE.MathUtils.lerp(b * 0.36, 38 * luminance, paintness);
    }
    context.putImageData(image, 0, 0);
  } else {
    context.fillStyle = '#2c2926';
    context.fillRect(0, 0, size, size);
  }
  context.fillStyle = `rgba(8,7,6,${soot})`;
  context.fillRect(0, 0, size, size);
}

function scorchDecalTexture(seed: number) {
  const random = seededRandom(seed);
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = 256;
  const context = context2d(canvas);
  context.filter = 'blur(6px)';
  for (let index = 0; index < 46; index += 1) {
    const angle = random() * Math.PI * 2;
    const distance = Math.pow(random(), 1.4) * 90;
    const x = 128 + Math.cos(angle) * distance;
    const y = 128 + Math.sin(angle) * distance * 0.7;
    const radius = 10 + random() * 34 * (1 - distance / 130);
    const glow = context.createRadialGradient(x, y, 0, x, y, radius);
    glow.addColorStop(0, `rgba(6,5,4,${0.55 + random() * 0.3})`);
    glow.addColorStop(1, 'rgba(6,5,4,0)');
    context.fillStyle = glow;
    context.fillRect(x - radius, y - radius, radius * 2, radius * 2);
  }
  context.filter = 'none';
  for (let index = 0; index < 500; index += 1) {
    const angle = random() * Math.PI * 2;
    const distance = Math.pow(random(), 0.8) * 100;
    context.fillStyle = `rgba(${random() > 0.8 ? 120 : 10},${random() > 0.8 ? 110 : 8},${random() > 0.8 ? 100 : 7},${0.25 + random() * 0.4})`;
    context.fillRect(128 + Math.cos(angle) * distance, 128 + Math.sin(angle) * distance * 0.7, 1 + random() * 2, 1 + random() * 2);
  }
  return canvas;
}

function contactShadowTexture() {
  const canvas = document.createElement('canvas');
  canvas.width = 4;
  canvas.height = 64;
  const context = context2d(canvas);
  for (let y = 0; y < 64; y += 1) {
    const across = Math.abs(y / 63 * 2 - 1);
    context.fillStyle = `rgba(0,0,0,${(Math.pow(1 - across, 1.7) * 0.62).toFixed(3)})`;
    context.fillRect(0, y, 4, 1);
  }
  return canvas;
}

/**
 * Projects box UVs from cabinet-space positions so every panel shares one continuous paint surface:
 * no stretched streaks on thin parts, and soot always settles from the cabinet top downward.
 */
export function projectCabinetUVs(geometry: THREE.BoxGeometry, origin: THREE.Vector3, bottomY: number, height: number) {
  const position = geometry.getAttribute('position');
  const uv = geometry.getAttribute('uv');
  // RoundedBoxGeometry is non-indexed but keeps BoxGeometry's groups, whose ranges then address vertices.
  const index = geometry.getIndex();
  // Classify by the box face each vertex belongs to (groups: +x, -x, +y, -y, +z, -z). Per-vertex normals
  // are unreliable on rounded edges and would mix projections inside one triangle (barcode streaks).
  const faceAxis = ['x', 'x', 'y', 'y', 'z', 'z'] as const;
  for (const group of geometry.groups) {
    const axis = faceAxis[group.materialIndex ?? 0] ?? 'y';
    for (let item = group.start; item < group.start + group.count; item += 1) {
      const vertex = index ? index.getX(item) : item;
      const x = position.getX(vertex) + origin.x;
      const y = position.getY(vertex) + origin.y;
      const z = position.getZ(vertex) + origin.z;
      const vertical = (y - bottomY) / height;
      if (axis === 'x') uv.setXY(vertex, z / height, vertical);
      else if (axis === 'z') uv.setXY(vertex, x / height, vertical);
      else uv.setXY(vertex, x / height, z / height);
    }
  }
  uv.needsUpdate = true;
}

// ---------------------------------------------------------------------------------------------
// Scene assembly

export interface FireHoseStationOptions {
  wallX: number;
  centerZ: number;
  anisotropy: number;
}

export function addFireHoseStation(scene: THREE.Scene, options: FireHoseStationOptions) {
  const { wallX, centerZ: cz, anisotropy } = options;
  const random = seededRandom(9251);
  let meshCount = 0;
  const add = <T extends THREE.Object3D>(object: T, parent: THREE.Object3D = scene): T => {
    object.traverse((child) => {
      if ((child as THREE.Mesh).isMesh) {
        child.castShadow = true;
        child.receiveShadow = true;
      }
    });
    parent.add(object);
    meshCount += 1;
    return object;
  };
  const box = (size: [number, number, number], material: THREE.Material, position: [number, number, number], parent?: THREE.Object3D) => {
    // Folded sheet-metal edges: a small radius catches a thin highlight instead of a razor-sharp CG edge.
    const radius = Math.min(0.006, Math.min(...size) / 2 - 0.0005);
    const geometry = new RoundedBoxGeometry(...size, 2, Math.max(radius, 0.0005));
    const origin = new THREE.Vector3(...position).add(parent?.position ?? new THREE.Vector3());
    projectCabinetUVs(geometry, origin, bottomY, height);
    const mesh = add(new THREE.Mesh(geometry, material), parent);
    mesh.position.set(...position);
    return mesh;
  };

  // Cabinet: surface-mounted steel box, hose compartment below a closed alarm panel.
  const width = 0.75;
  const depth = 0.2;
  const bottomY = 0.72;
  const topY = 1.77;
  const dividerY = 1.52;
  const sheet = 0.014;
  const frontX = wallX - depth;
  const height = topY - bottomY;

  // Painted surfaces use generated art from one paint batch (exterior, reel, back plate); bare hardware
  // uses the scanned rust surface (Poly Haven `rusty_metal_03`, CC0) for real normal and roughness detail.
  const assetBase = `${import.meta.env.BASE_URL}assets/corridor-preview/`;
  const textureLoader = new THREE.TextureLoader();
  const rustSurfaceMap = (file: string, repeat: number, mirroredT = false) => {
    const texture = textureLoader.load(`${assetBase}${file}`);
    texture.colorSpace = THREE.NoColorSpace;
    texture.wrapS = THREE.RepeatWrapping;
    texture.wrapT = mirroredT ? THREE.MirroredRepeatWrapping : THREE.RepeatWrapping;
    texture.repeat.set(repeat, repeat);
    texture.anisotropy = anisotropy;
    return texture;
  };
  const squareCanvas = (size: number) => {
    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = size;
    return canvas;
  };
  const paintedArt = (file: string, repeat: number, mirroredT: boolean, colour: boolean) => {
    const texture = textureLoader.load(`${assetBase}${file}`);
    texture.colorSpace = colour ? THREE.SRGBColorSpace : THREE.NoColorSpace;
    texture.wrapS = THREE.RepeatWrapping;
    texture.wrapT = mirroredT ? THREE.MirroredRepeatWrapping : THREE.RepeatWrapping;
    texture.repeat.set(repeat, repeat);
    texture.anisotropy = anisotropy;
    return texture;
  };

  const steelCanvas = squareCanvas(512);
  drawRustHardware(steelCanvas, 0.25);
  const steelMap = canvasTexture(steelCanvas, anisotropy);
  steelMap.wrapS = steelMap.wrapT = THREE.RepeatWrapping;
  steelMap.repeat.set(0.45, 0.45);

  const rustPhoto = new Image();
  rustPhoto.addEventListener('load', () => {
    drawRustHardware(steelCanvas, 0.25, rustPhoto);
    steelMap.needsUpdate = true;
    document.body.dataset.fireCabinetSurface = 'scanned';
  }, { once: true });
  rustPhoto.src = `${assetBase}cabinet-rust-diff-1k.jpg`;

  // Soot mattes the scanned paint: remap its roughness from 0..1 into 0.55..1 so nothing reads glossy.
  const roughnessCanvas = squareCanvas(1024);
  const roughnessTextures: THREE.CanvasTexture[] = [];
  context2d(roughnessCanvas).fillStyle = '#d0d0d0';
  context2d(roughnessCanvas).fillRect(0, 0, roughnessCanvas.width, roughnessCanvas.height);
  const roughnessSource = new Image();
  roughnessSource.addEventListener('load', () => {
    const context = context2d(roughnessCanvas);
    context.drawImage(roughnessSource, 0, 0, roughnessCanvas.width, roughnessCanvas.height);
    const image = context.getImageData(0, 0, roughnessCanvas.width, roughnessCanvas.height);
    for (let index = 0; index < image.data.length; index += 4) {
      const matte = 140 + image.data[index + 1]! * 0.45;
      image.data[index] = image.data[index + 1] = image.data[index + 2] = matte;
    }
    context.putImageData(image, 0, 0);
    for (const texture of roughnessTextures) texture.needsUpdate = true;
  }, { once: true });
  roughnessSource.src = `${assetBase}cabinet-rust-rough-1k.jpg`;
  const surface = (repeat: number, mirroredT = false) => {
    const roughnessMap = canvasTexture(roughnessCanvas, anisotropy, false);
    roughnessMap.wrapS = THREE.RepeatWrapping;
    roughnessMap.wrapT = mirroredT ? THREE.MirroredRepeatWrapping : THREE.RepeatWrapping;
    roughnessMap.repeat.set(repeat, repeat);
    roughnessTextures.push(roughnessMap);
    return { normalMap: rustSurfaceMap('cabinet-rust-normal-gl-1k.jpg', repeat, mirroredT), roughnessMap };
  };
  // Exterior: generated fire-damaged enamel (fire-cabinet-exterior-v1.jpg). Its soot is heaviest at the top,
  // and projectCabinetUVs maps v = 0..1 over the cabinet height so that gradient lines up on every panel.
  const shellMaterial = new THREE.MeshStandardMaterial({
    map: paintedArt('fire-cabinet-exterior-v1.jpg', 1, true, true),
    bumpMap: paintedArt('fire-cabinet-exterior-v1.jpg', 1, true, false),
    bumpScale: 0.012,
    roughness: 0.9,
    metalness: 0.12,
    envMapIntensity: 0.14,
  });
  // Inner back plate: generated art cropped to the panel (sheltered red paint, soot from the top and the
  // clean outline of the missing extinguisher, centred on the empty bracket below).
  const backplateMap = textureLoader.load(`${assetBase}fire-cabinet-backplate-v1.jpg`);
  backplateMap.colorSpace = THREE.SRGBColorSpace;
  backplateMap.anisotropy = anisotropy;
  const backplateBump = textureLoader.load(`${assetBase}fire-cabinet-backplate-v1.jpg`);
  backplateBump.colorSpace = THREE.NoColorSpace;
  const backMaterial = new THREE.MeshStandardMaterial({
    map: backplateMap,
    // Sheltered paint stays redder than the shell, but still sits in a dark, smoke-filled cabinet.
    color: 0xb4aaa6,
    bumpMap: backplateBump,
    bumpScale: 0.01,
    roughness: 0.88,
    metalness: 0.1,
    envMapIntensity: 0.12,
  });
  const hardwareSurface = surface(0.45);
  const scorchedSteelMaterial = new THREE.MeshStandardMaterial({
    map: steelMap,
    ...hardwareSurface,
    roughness: 1,
    metalness: 0.6,
    envMapIntensity: 0.22,
    // Open bands (bracket, bell skirt) are seen from both sides.
    side: THREE.DoubleSide,
  });
  // The reel and valve wheel were painted with the same enamel as the cabinet.
  const reelPaintMaterial = new THREE.MeshStandardMaterial({
    map: paintedArt('fire-cabinet-exterior-v1.jpg', 0.45, false, true),
    normalMap: hardwareSurface.normalMap,
    normalScale: new THREE.Vector2(0.6, 0.6),
    roughness: 0.92,
    metalness: 0.15,
    envMapIntensity: 0.16,
  });
  const brassMaterial = new THREE.MeshStandardMaterial({
    color: 0x2c2418,
    ...hardwareSurface,
    roughness: 0.75,
    metalness: 0.7,
    envMapIntensity: 0.26,
  });

  const midX = wallX - depth / 2;
  box([depth, sheet, width], shellMaterial, [midX, topY - sheet / 2, cz]);
  box([depth, sheet, width], shellMaterial, [midX, bottomY + sheet / 2, cz]);
  box([depth, sheet, width - sheet * 2], shellMaterial, [midX, dividerY, cz]);
  for (const side of [-1, 1]) {
    box([depth, height, sheet], shellMaterial, [midX, bottomY + height / 2, cz + side * (width / 2 - sheet / 2)]);
    // Folded front rim of the hose compartment.
    box([sheet, dividerY - bottomY, 0.03], shellMaterial, [frontX + sheet / 2, (bottomY + dividerY) / 2, cz + side * (width / 2 - 0.015)]);
  }
  box([sheet, 0.03, width], shellMaterial, [frontX + sheet / 2, bottomY + 0.015, cz]);
  box([sheet, topY - dividerY, width], shellMaterial, [frontX + sheet / 2, (topY + dividerY) / 2, cz]);
  const backPanel = add(new THREE.Mesh(new THREE.PlaneGeometry(width - sheet * 2, dividerY - bottomY - sheet), backMaterial));
  backPanel.position.set(wallX - 0.004, (bottomY + dividerY) / 2, cz);
  backPanel.rotation.y = -Math.PI / 2;

  // Alarm panel: dead indicator lamp, bell and a manual button whose cover is cracked.
  const panelY = (topY + dividerY) / 2;
  // Soot-filmed red lamp glass: a dull sheen, not a clean glossy highlight.
  const lampMaterial = new THREE.MeshStandardMaterial({ color: 0x1a0504, roughness: 0.62, metalness: 0, envMapIntensity: 0.2 });
  const lamp = add(new THREE.Mesh(new THREE.SphereGeometry(0.036, 24, 12, 0, Math.PI * 2, 0, Math.PI / 2), lampMaterial));
  lamp.position.set(frontX, panelY, cz - 0.2);
  lamp.rotation.z = Math.PI / 2;
  lamp.scale.set(1, 0.6, 1);
  const lampBase = add(new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.045, 0.012, 24), scorchedSteelMaterial));
  lampBase.position.set(frontX - 0.004, panelY, cz - 0.2);
  lampBase.rotation.z = Math.PI / 2;
  // Shallow alarm gong on a short skirt, with its striker post on top.
  const bell = add(new THREE.Mesh(new THREE.CylinderGeometry(0.058, 0.062, 0.012, 32, 1, true), scorchedSteelMaterial));
  bell.position.set(frontX - 0.006, panelY, cz);
  bell.rotation.z = Math.PI / 2;
  const bellCap = add(new THREE.Mesh(new THREE.SphereGeometry(0.058, 32, 10, 0, Math.PI * 2, 0, Math.PI / 2), scorchedSteelMaterial));
  bellCap.position.set(frontX - 0.012, panelY, cz);
  bellCap.rotation.z = Math.PI / 2;
  bellCap.scale.set(1, 0.3, 1);
  const bellNut = add(new THREE.Mesh(new THREE.CylinderGeometry(0.009, 0.009, 0.012, 6), scorchedSteelMaterial));
  bellNut.position.set(frontX - 0.034, panelY, cz);
  bellNut.rotation.z = Math.PI / 2;
  box([0.012, 0.075, 0.075], scorchedSteelMaterial, [frontX - 0.006, panelY, cz + 0.2]);
  const button = add(new THREE.Mesh(new THREE.CylinderGeometry(0.018, 0.018, 0.012, 20), lampMaterial));
  button.position.set(frontX - 0.017, panelY, cz + 0.2);
  button.rotation.z = Math.PI / 2;

  // Hose reel: painted drum on a hub, front and back rims with four flat spokes each.
  const reelCenter = new THREE.Vector3(wallX - 0.07, 1.14, cz + 0.12);
  const hub = add(new THREE.Mesh(new THREE.CylinderGeometry(0.075, 0.075, 0.09, 28), reelPaintMaterial));
  hub.position.copy(reelCenter);
  hub.rotation.z = Math.PI / 2;
  const hubCap = add(new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.034, 0.03, 20), scorchedSteelMaterial));
  hubCap.position.copy(reelCenter).add(new THREE.Vector3(-0.06, 0, 0));
  hubCap.rotation.z = Math.PI / 2;
  const hubNut = add(new THREE.Mesh(new THREE.CylinderGeometry(0.016, 0.016, 0.014, 6), scorchedSteelMaterial));
  hubNut.position.copy(reelCenter).add(new THREE.Vector3(-0.081, 0, 0));
  hubNut.rotation.z = Math.PI / 2;
  const boltGeometry = new THREE.CylinderGeometry(0.0055, 0.0055, 0.008, 6);
  for (const rimOffset of [-0.045, 0.045]) {
    const rim = add(new THREE.Mesh(new THREE.TorusGeometry(0.22, 0.007, 8, 48), reelPaintMaterial));
    rim.position.copy(reelCenter).add(new THREE.Vector3(rimOffset, 0, 0));
    rim.rotation.y = Math.PI / 2;
    for (let spoke = 0; spoke < 4; spoke += 1) {
      const angle = Math.PI / 4 + (spoke * Math.PI) / 2;
      const bar = add(new THREE.Mesh(new THREE.BoxGeometry(0.005, 0.15, 0.022), reelPaintMaterial));
      bar.position.copy(reelCenter).add(new THREE.Vector3(rimOffset, Math.sin(angle) * 0.1475, Math.cos(angle) * 0.1475));
      bar.rotation.x = -angle + Math.PI / 2;
      if (rimOffset > 0) continue;
      for (const radius of [0.085, 0.212]) {
        const bolt = add(new THREE.Mesh(boltGeometry, scorchedSteelMaterial));
        bolt.position.copy(reelCenter).add(new THREE.Vector3(rimOffset - 0.006, Math.sin(angle) * radius, Math.cos(angle) * radius));
        bolt.rotation.z = Math.PI / 2;
      }
    }
  }

  // Empty extinguisher bracket and the hydrant valve above it.
  // Centred on the extinguisher outline in fire-cabinet-backplate-v1.jpg (21.6% across the plate).
  const bracketZ = cz - 0.205;
  box([0.006, 0.44, 0.032], scorchedSteelMaterial, [wallX - 0.012, 1.02, bracketZ]);
  for (const y of [0.9, 1.16]) {
    // Flat steel band, 225° open toward the corridor where the extinguisher was lifted out.
    const clamp = add(new THREE.Mesh(
      new THREE.CylinderGeometry(0.068, 0.068, 0.024, 32, 1, true, -Math.PI * 0.125, Math.PI * 1.25),
      scorchedSteelMaterial,
    ));
    clamp.position.set(wallX - 0.083, y, bracketZ);
    const tab = add(new THREE.Mesh(new THREE.BoxGeometry(0.02, 0.024, 0.03), scorchedSteelMaterial));
    tab.position.set(wallX - 0.02, y, bracketZ);
  }
  const valveY = 1.41;
  const supply = add(new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 0.07, 16), brassMaterial));
  supply.position.set(wallX - 0.04, valveY, bracketZ);
  supply.rotation.z = Math.PI / 2;
  const valveBody = add(new THREE.Mesh(new THREE.SphereGeometry(0.034, 18, 12), brassMaterial));
  valveBody.position.set(wallX - 0.085, valveY, bracketZ);
  const outlet = add(new THREE.Mesh(new THREE.CylinderGeometry(0.026, 0.029, 0.07, 18), brassMaterial));
  outlet.position.set(wallX - 0.085, valveY - 0.055, bracketZ);
  const stem = add(new THREE.Mesh(new THREE.CylinderGeometry(0.007, 0.007, 0.06, 10), scorchedSteelMaterial));
  stem.position.set(wallX - 0.085, valveY + 0.05, bracketZ);
  const wheel = add(new THREE.Mesh(new THREE.TorusGeometry(0.042, 0.006, 8, 30), reelPaintMaterial));
  wheel.position.set(wallX - 0.085, valveY + 0.08, bracketZ);
  wheel.rotation.x = Math.PI / 2;
  for (let spoke = 0; spoke < 3; spoke += 1) {
    const bar = add(new THREE.Mesh(new THREE.BoxGeometry(0.084, 0.006, 0.006), reelPaintMaterial));
    bar.position.copy(wheel.position);
    bar.rotation.y = (spoke * Math.PI) / 3;
  }

  // Glass door hangs open on its left hinge; only jagged shards remain in the frame.
  const doorWidth = width - 0.02;
  const doorHeight = dividerY - bottomY - 0.02;
  const hinge = new THREE.Vector3(frontX - 0.004, bottomY + 0.01, cz - width / 2 + 0.005);
  const openAngle = THREE.MathUtils.degToRad(105);
  const door = new THREE.Group();
  door.position.copy(hinge);
  door.rotation.y = -openAngle;
  scene.add(door);
  const bar = 0.028;
  box([0.022, bar, doorWidth], shellMaterial, [-0.011, bar / 2, doorWidth / 2], door);
  box([0.022, bar, doorWidth], shellMaterial, [-0.011, doorHeight - bar / 2, doorWidth / 2], door);
  box([0.022, doorHeight, bar], shellMaterial, [-0.011, doorHeight / 2, bar / 2], door);
  box([0.022, doorHeight, bar], shellMaterial, [-0.011, doorHeight / 2, doorWidth - bar / 2], door);
  box([0.018, 0.09, 0.016], scorchedSteelMaterial, [-0.03, doorHeight * 0.5, doorWidth - 0.02], door);
  // Two barrel hinges on the cabinet edge carry the open door.
  for (const hingeY of [0.12, doorHeight - 0.12]) {
    const knuckle = add(new THREE.Mesh(new THREE.CylinderGeometry(0.0075, 0.0075, 0.07, 12), scorchedSteelMaterial));
    knuckle.position.set(hinge.x, hinge.y + hingeY, hinge.z);
  }

  // Soot-filmed glass: mostly see-through, only catching the light at grazing angles.
  const glassMaterial = new THREE.MeshPhysicalMaterial({
    color: 0x24221f,
    roughness: 0.16,
    metalness: 0,
    transparent: true,
    opacity: 0.2,
    envMapIntensity: 0.55,
    specularIntensity: 0.7,
    side: THREE.DoubleSide,
    depthWrite: false,
  });
  const shardPositions: number[] = [];
  const inner = { z0: bar, z1: doorWidth - bar, y0: bar, y1: doorHeight - bar };
  const edges: Array<{ from: [number, number]; to: [number, number]; inward: [number, number] }> = [
    { from: [inner.z0, inner.y0], to: [inner.z1, inner.y0], inward: [0, 1] },
    { from: [inner.z0, inner.y1], to: [inner.z1, inner.y1], inward: [0, -1] },
    { from: [inner.z0, inner.y0], to: [inner.z0, inner.y1], inward: [1, 0] },
    { from: [inner.z1, inner.y0], to: [inner.z1, inner.y1], inward: [-1, 0] },
  ];
  const pushShardPoint = (z: number, y: number) => shardPositions.push(-0.011, y, z);
  for (const edge of edges) {
    // Broken panes keep a few irregular pieces along some edges, not an even row of teeth.
    const pieces = random() < 0.3 ? 0 : 1 + Math.floor(random() * 2);
    for (let piece = 0; piece < pieces; piece += 1) {
      const a = random() * 0.7;
      const b = Math.min(1, a + 0.08 + random() * 0.28);
      const along = (t: number): [number, number] => [
        THREE.MathUtils.lerp(edge.from[0], edge.to[0], t),
        THREE.MathUtils.lerp(edge.from[1], edge.to[1], t),
      ];
      const [az, ay] = along(a);
      const [bz, by] = along(b);
      const [cz1, cy1] = along(THREE.MathUtils.lerp(a, b, 0.25 + random() * 0.2));
      const [cz2, cy2] = along(THREE.MathUtils.lerp(a, b, 0.6 + random() * 0.3));
      const depth1 = 0.015 + random() * 0.07;
      const depth2 = 0.03 + random() * 0.13;
      const p1: [number, number] = [cz1 + edge.inward[0] * depth1, cy1 + edge.inward[1] * depth1];
      const p2: [number, number] = [cz2 + edge.inward[0] * depth2, cy2 + edge.inward[1] * depth2];
      pushShardPoint(az, ay); pushShardPoint(bz, by); pushShardPoint(...p2);
      pushShardPoint(az, ay); pushShardPoint(...p2); pushShardPoint(...p1);
    }
  }
  // One larger wedge still lodged in the upper hinge-side corner, with a sliver beside it.
  pushShardPoint(inner.z0, inner.y1); pushShardPoint(inner.z0 + 0.21, inner.y1); pushShardPoint(inner.z0 + 0.05, inner.y1 - 0.12);
  pushShardPoint(inner.z0, inner.y1); pushShardPoint(inner.z0 + 0.05, inner.y1 - 0.12); pushShardPoint(inner.z0, inner.y1 - 0.29);
  const shardGeometry = new THREE.BufferGeometry();
  shardGeometry.setAttribute('position', new THREE.Float32BufferAttribute(shardPositions, 3));
  shardGeometry.computeVertexNormals();
  const frameShards = add(new THREE.Mesh(shardGeometry, glassMaterial), door);
  frameShards.castShadow = false;

  const floorShardGeometry = new THREE.BufferGeometry();
  floorShardGeometry.setAttribute('position', new THREE.Float32BufferAttribute([0, 0, -0.5, 0.45, 0, 0.4, -0.5, 0, 0.3], 3));
  floorShardGeometry.computeVertexNormals();
  const floorShards = new THREE.InstancedMesh(floorShardGeometry, glassMaterial, 34);
  const shardTransform = new THREE.Object3D();
  for (let index = 0; index < 34; index += 1) {
    const spread = Math.pow(random(), 1.5);
    shardTransform.position.set(
      frontX - 0.05 - spread * 0.75,
      0.0028 + random() * 0.002,
      cz - 0.45 + (random() - 0.35) * 0.9 * (0.4 + spread),
    );
    shardTransform.rotation.set((random() - 0.5) * 0.08, random() * Math.PI * 2, (random() - 0.5) * 0.08);
    const scale = 0.012 + Math.pow(random(), 2) * 0.05;
    shardTransform.scale.set(scale * (0.6 + random() * 0.8), 1, scale);
    shardTransform.updateMatrix();
    floorShards.setMatrixAt(index, shardTransform.matrix);
  }
  floorShards.castShadow = false;
  floorShards.receiveShadow = true;
  scene.add(floorShards);
  meshCount += 1;

  // ---- Hose -------------------------------------------------------------------------------
  // Generated canvas jacket (fire-hose-jacket-v1.jpg): U runs along the hose and mirror-repeats so the
  // image's left/right edges never meet at a hard seam; V wraps once around the hose, seam on its edge.
  const jacketMap = (colour: boolean) => {
    const texture = textureLoader.load(`${assetBase}fire-hose-jacket-v1.jpg`);
    texture.colorSpace = colour ? THREE.SRGBColorSpace : THREE.NoColorSpace;
    texture.wrapS = THREE.MirroredRepeatWrapping;
    texture.wrapT = THREE.RepeatWrapping;
    texture.anisotropy = anisotropy;
    return texture;
  };
  const hoseMaterial = new THREE.MeshStandardMaterial({
    map: jacketMap(true),
    // Soot-greyed and water-darkened: pull the faded red jacket down so it does not read salmon pink.
    color: 0x8f7c77,
    vertexColors: true,
    roughness: 0.9,
    metalness: 0,
    bumpMap: jacketMap(false),
    bumpScale: 0.003,
    envMapIntensity: 0.12,
    side: THREE.DoubleSide,
  });
  const shadowMaterial = new THREE.MeshBasicMaterial({
    map: canvasTexture(contactShadowTexture(), anisotropy, false),
    color: 0x000000,
    vertexColors: true,
    transparent: true,
    depthWrite: false,
    toneMapped: false,
  });
  shadowMaterial.map!.wrapS = THREE.RepeatWrapping;

  const floor = (x: number, z: number): HoseControlPoint => ({ position: new THREE.Vector3(x, 0, z), up: new THREE.Vector3(0, 1, 0) });
  const air = (x: number, y: number, z: number, up?: [number, number, number]): HoseControlPoint => ({
    position: new THREE.Vector3(x, y, z),
    up: up ? new THREE.Vector3(...up) : undefined,
  });

  // Remaining wraps on the drum, flat face against it; outermost layer peels off at the bottom.
  const reelWraps: HoseControlPoint[] = [];
  const wrapStart = -Math.PI / 2 + Math.PI * 2 * 1.3;
  const wrapRadius = 0.075 + 0.013;
  const wrapPitch = 0.026;
  for (let angle = wrapStart; angle > -Math.PI / 2 + 1e-6; angle -= Math.PI / 6) {
    const radius = wrapRadius + wrapPitch * ((wrapStart - angle) / (Math.PI * 2));
    reelWraps.push(air(reelCenter.x, reelCenter.y + Math.sin(angle) * radius, reelCenter.z + Math.cos(angle) * radius, [0, -Math.sin(angle), -Math.cos(angle)]));
  }
  const bottomRadius = wrapRadius + wrapPitch * 1.3;
  const lipY = bottomY + 0.03;
  const segmentOne: HoseControlPoint[] = [
    ...reelWraps,
    air(reelCenter.x, reelCenter.y - bottomRadius, reelCenter.z, [0, 1, 0]),
    air(reelCenter.x - 0.02, reelCenter.y - bottomRadius - 0.03, reelCenter.z - 0.11),
    air(frontX + 0.045, 0.87, cz - 0.08),
    air(frontX - 0.008, lipY + 0.011, cz - 0.11, [-0.6, 0.8, 0]),
    air(frontX - 0.075, 0.55, cz - 0.15, [-1, 0.08, 0]),
    air(frontX - 0.11, 0.24, cz - 0.19),
    air(frontX - 0.17, 0.05, cz - 0.24),
    // Long, uneven sweeps with one tighter bend where the hose snagged while being dragged.
    floor(1.2, -9.56),
    floor(1.0, -9.82),
    floor(0.93, -10.3),
    floor(1.0, -10.95),
    floor(1.06, -11.35),
    floor(0.86, -11.76),
  ];
  const segmentTwo = [
    floor(0.7, -12.12),
    floor(0.47, -12.5),
    floor(0.12, -13.05),
    floor(-0.22, -13.5),
    floor(-0.42, -13.95),
    floor(-0.5, -14.36),
  ];
  const segmentThree = [
    floor(-0.55, -14.78),
    floor(-0.64, -15.3),
    floor(-0.5, -15.95),
    floor(-0.12, -16.5),
    floor(0.3, -17.15),
    floor(0.56, -17.72),
  ];

  const hoseSegments: Array<{ points: HoseControlPoint[]; burntStart: boolean; burntEnd: boolean; coupling: boolean; seed: number }> = [
    { points: segmentOne, burntStart: false, burntEnd: true, coupling: false, seed: 11 },
    { points: segmentTwo, burntStart: true, burntEnd: true, coupling: false, seed: 12 },
    { points: segmentThree, burntStart: true, burntEnd: false, coupling: true, seed: 13 },
  ];

  const fiberGeometry = new THREE.CylinderGeometry(0.0011, 0.0006, 1, 4);
  fiberGeometry.translate(0, 0.5, 0);
  const fiberMaterial = new THREE.MeshStandardMaterial({ color: 0x1a1210, roughness: 1 });
  const fibers = new THREE.InstancedMesh(fiberGeometry, fiberMaterial, 4 * 16);
  let fiberCount = 0;
  const fiberTransform = new THREE.Object3D();
  const yAxis = new THREE.Vector3(0, 1, 0);

  const scorchMaterial = new THREE.MeshBasicMaterial({
    map: canvasTexture(scorchDecalTexture(77), anisotropy),
    transparent: true,
    depthWrite: false,
    toneMapped: false,
    polygonOffset: true,
    polygonOffsetFactor: -2,
  });
  const fragmentMaterial = new THREE.MeshStandardMaterial({ color: 0x120e0c, roughness: 0.95 });

  let couplingPose: { position: THREE.Vector3; tangent: THREE.Vector3 } | null = null;
  const burntEnds: THREE.Vector3[] = [];

  for (const segment of hoseSegments) {
    const segmentRandom = seededRandom(segment.seed * 97);
    const phaseA = segmentRandom() * 10;
    const phaseB = segmentRandom() * 10;
    const burnDistance = (s: number, length: number) => Math.min(
      segment.burntStart ? s : Infinity,
      segment.burntEnd ? length - s : Infinity,
    );
    const { geometry, samples } = buildFlatHose({
      points: segment.points,
      // The 3:2 jacket image wraps a ~0.15 m hose perimeter, so one image spans ~0.22 m of hose length.
      tileLength: 0.22,
      seed: segment.seed,
      profile: (s, length) => {
        const burnt = burnDistance(s, length);
        const burn = Number.isFinite(burnt) ? 1 - THREE.MathUtils.smoothstep(burnt, 0, 0.07) : 0;
        const round = segment.coupling ? THREE.MathUtils.smoothstep(s, length - 0.16, length - 0.01) : 0;
        // Residual water keeps a used hose oval rather than tape-flat, pooling unevenly along its length;
        // it rounds fully at the coupling.
        const pooled = 0.8 + 0.4 * (0.5 + 0.5 * Math.sin(s * 3.7 + phaseB) * Math.sin(s * 1.3 + phaseA));
        return {
          halfWidth: THREE.MathUtils.lerp(0.034 * (1.06 - pooled * 0.06), 0.031, round) * (1 - burn * 0.22),
          halfThickness: THREE.MathUtils.lerp(0.0105 * pooled, 0.031, round) * (1 - burn * 0.4),
          jag: Number.isFinite(burnt) ? 1 - THREE.MathUtils.smoothstep(burnt, 0, 0.025) : 0,
        };
      },
      shade: (s, length, downward) => {
        const burnt = burnDistance(s, length);
        const char = Number.isFinite(burnt) ? Math.exp(-burnt / 0.15) : 0;
        // The jacket art already carries fine grime; this adds only the long, uneven soot bands along the run.
        const soot = THREE.MathUtils.clamp(0.5 + 0.5 * Math.sin(s * 6.1 + phaseA) * Math.sin(s * 1.7 + phaseB), 0, 1) * 0.3;
        const grime = 1 - downward * 0.32;
        const light = (1 - soot) * grime;
        return [
          THREE.MathUtils.lerp(light, 0.1, char),
          THREE.MathUtils.lerp(light, 0.085, char),
          THREE.MathUtils.lerp(light, 0.075, char),
        ];
      },
    });
    add(new THREE.Mesh(geometry, hoseMaterial));
    const shadow = add(new THREE.Mesh(buildContactShadow(samples, 1.9), shadowMaterial));
    shadow.castShadow = false;
    shadow.receiveShadow = false;

    const ends: Array<{ sample: FlatHoseSample; outward: THREE.Vector3 }> = [];
    if (segment.burntStart) ends.push({ sample: samples[0]!, outward: samples[0]!.tangent.clone().negate() });
    if (segment.burntEnd) ends.push({ sample: samples[samples.length - 1]!, outward: samples[samples.length - 1]!.tangent.clone() });
    for (const { sample, outward } of ends) {
      burntEnds.push(sample.position.clone());
      for (let fiber = 0; fiber < 16 && fiberCount < fibers.count; fiber += 1) {
        const angle = segmentRandom() * Math.PI * 2;
        const [sx, sy] = crossSection(angle);
        const base = sample.position.clone()
          .addScaledVector(sample.binormal, sample.halfWidth * sx * 0.8)
          .addScaledVector(sample.normal, sample.halfThickness * sy);
        const direction = outward.clone()
          .addScaledVector(sample.binormal, (segmentRandom() - 0.5) * 1.4)
          .addScaledVector(yAxis, (segmentRandom() - 0.7) * 0.4)
          .normalize();
        fiberTransform.position.copy(base);
        fiberTransform.quaternion.setFromUnitVectors(yAxis, direction);
        const lengthScale = 0.012 + segmentRandom() * 0.035;
        fiberTransform.scale.set(1, lengthScale, 1);
        fiberTransform.updateMatrix();
        fibers.setMatrixAt(fiberCount, fiberTransform.matrix);
        fiberCount += 1;
      }
    }
    if (segment.coupling) {
      const last = samples[samples.length - 1]!;
      couplingPose = { position: last.position.clone(), tangent: last.tangent.clone().setY(0).normalize() };
    }
  }
  fibers.count = fiberCount;
  fibers.instanceMatrix.needsUpdate = true;
  scene.add(fibers);
  meshCount += 1;

  // Burn-through gaps: scorched floor and a few crumbled jacket fragments.
  for (let pair = 0; pair + 1 < burntEnds.length; pair += 2) {
    const a = burntEnds[pair]!;
    const b = burntEnds[pair + 1]!;
    const middle = a.clone().add(b).multiplyScalar(0.5);
    const scorch = add(new THREE.Mesh(new THREE.PlaneGeometry(0.95, 0.62), scorchMaterial));
    scorch.position.set(middle.x, 0.0032, middle.z);
    scorch.rotation.set(-Math.PI / 2, 0, Math.atan2(b.x - a.x, b.z - a.z) + Math.PI / 2);
    scorch.castShadow = false;
    for (let fragment = 0; fragment < 5; fragment += 1) {
      const piece = add(new THREE.Mesh(
        new THREE.BoxGeometry(0.012 + random() * 0.03, 0.003, 0.01 + random() * 0.025),
        fragmentMaterial,
      ));
      piece.position.set(middle.x + (random() - 0.5) * 0.2, 0.0035, middle.z + (random() - 0.5) * 0.18);
      piece.rotation.set((random() - 0.5) * 0.2, random() * Math.PI, (random() - 0.5) * 0.2);
    }
  }

  // Coupling and nozzle lying at the end of the run, blackened brass.
  if (couplingPose) {
    const { position, tangent } = couplingPose;
    const heading = Math.atan2(tangent.x, tangent.z);
    const assembly = new THREE.Group();
    assembly.position.set(position.x, 0.036, position.z);
    assembly.rotation.y = heading;
    scene.add(assembly);
    const coupling = add(new THREE.Mesh(new THREE.CylinderGeometry(0.036, 0.036, 0.085, 24), brassMaterial), assembly);
    coupling.rotation.x = Math.PI / 2;
    coupling.position.z = 0.035;
    for (const side of [-1, 1]) {
      const lug = add(new THREE.Mesh(new THREE.BoxGeometry(0.018, 0.022, 0.03), brassMaterial), assembly);
      lug.position.set(side * 0.04, 0, 0.05);
    }
    const nozzle = add(new THREE.Mesh(new THREE.CylinderGeometry(0.014, 0.029, 0.27, 24), brassMaterial), assembly);
    nozzle.rotation.x = Math.PI / 2 + 0.07;
    nozzle.position.set(0, -0.009, 0.21);
    const grip = add(new THREE.Mesh(new THREE.CylinderGeometry(0.033, 0.033, 0.06, 24), scorchedSteelMaterial), assembly);
    grip.rotation.x = Math.PI / 2 + 0.07;
    grip.position.set(0, -0.002, 0.11);
  }

  const obstacles: CorridorObstacle[] = [
    { ax: frontX, az: cz - width / 2, bx: frontX, bz: cz + width / 2 },
    {
      ax: hinge.x,
      az: hinge.z,
      bx: hinge.x - Math.sin(openAngle) * doorWidth,
      bz: hinge.z + Math.cos(openAngle) * doorWidth,
    },
  ];
  return { meshCount, obstacles };
}
