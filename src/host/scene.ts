// Three.js 暗房場景：玩家視點固定於房間中央，SpotLight 手電筒從視點射出。
// 本階段平面渲染（corner-pin warp 是模組 4）。可調參數集中在檔案頂部。

import * as THREE from 'three';
import type { ProjectionCorners } from '../shared/calibration';
import { publicUrl } from '../shared/public-url';
import { CinematicBackdrop } from './cinematic-backdrop';
import { JumpscareOverlay } from './jumpscare-overlay';
import { ProjectionWarp } from './projection-warp';

// —— 實測調整用常數 ——
export const CAMERA_FOV = 60;
export const LIGHT_ANGLE = 0.24; // 光錐半角（rad）
export const LIGHT_PENUMBRA = 0.45; // 邊緣柔化 0–1
const LIGHT_INTENSITY = 40; // r155+ 物理光照，配合 decay 調
const LIGHT_DECAY = 1.4;
const AMBIENT_INTENSITY = 0.015; // 近乎全黑，留一絲輪廓

/** 玩家視點（房間中央、站立眼高） */
export const VIEWPOINT = new THREE.Vector3(0, 1.6, 0);

export interface SceneHandles {
  scene: THREE.Scene;
  camera: THREE.PerspectiveCamera;
  renderer: THREE.WebGLRenderer;
  spotlight: THREE.SpotLight;
  lightTarget: THREE.Object3D;
  actors: SceneActors;
  cinematic: CinematicBackdrop;
  jumpscare: JumpscareOverlay;
  setProjectionCorners(corners: ProjectionCorners): void;
  setPixelRatioLimit(limit: number): void;
  resize(): void;
  render(): void;
}

export interface SceneActors {
  portrait: THREE.Mesh<THREE.BufferGeometry, THREE.MeshStandardMaterial>;
  silhouette: THREE.Mesh<THREE.BufferGeometry, THREE.MeshStandardMaterial>;
}

function prop(
  geometry: THREE.BufferGeometry,
  color: number,
  position: [number, number, number],
  rotationY = 0,
): THREE.Mesh<THREE.BufferGeometry, THREE.MeshStandardMaterial> {
  const mesh = new THREE.Mesh(
    geometry,
    new THREE.MeshStandardMaterial({ color, roughness: 0.85 }),
  );
  mesh.position.set(...position);
  mesh.rotation.y = rotationY;
  return mesh;
}

export function createScene(canvas: HTMLCanvasElement, mode: 'story' | 'raid' = 'story'): SceneHandles {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
  let pixelRatioLimit = 2;
  renderer.setPixelRatio(Math.min(devicePixelRatio, pixelRatioLimit));
  const projectionWarp = new ProjectionWarp(renderer);

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x000000);

  const camera = new THREE.PerspectiveCamera(
    CAMERA_FOV,
    innerWidth / innerHeight,
    0.1,
    50,
  );
  camera.position.copy(VIEWPOINT);

  // 程序化場景保留為 2.5D 圖片載入失敗時的 fallback。
  const fallbackGroup = new THREE.Group();
  const room = new THREE.Mesh(
    new THREE.BoxGeometry(6, 3, 6),
    new THREE.MeshStandardMaterial({ color: 0x8a8378, roughness: 0.95, side: THREE.BackSide }),
  );
  room.position.y = 1.5;
  fallbackGroup.add(room);

  // 可被照亮的物件：正前方牆角一帶
  fallbackGroup.add(prop(new THREE.BoxGeometry(0.7, 0.5, 0.5), 0x6b4a2f, [-1.2, 0.25, -2.6], 0.3)); // 木箱
  const portrait = prop(new THREE.PlaneGeometry(0.6, 0.8), 0x4a3b33, [1.0, 1.6, -2.98]);
  const silhouette = prop(new THREE.BoxGeometry(0.45, 1.7, 0.25), 0x1c1c20, [2.4, 0.85, -2.7], -0.2);
  silhouette.visible = false;
  fallbackGroup.add(portrait);
  fallbackGroup.add(silhouette);
  fallbackGroup.add(prop(new THREE.BoxGeometry(0.5, 0.9, 0.4), 0x3a3a35, [2.7, 0.45, -1.2], 0.5)); // 矮櫃
  scene.add(fallbackGroup);
  if (mode === 'raid') fallbackGroup.visible = false;

  const cinematic = new CinematicBackdrop(
    scene,
    camera,
    mode === 'raid' ? null : publicUrl('assets/room-sequence.png'),
    () => {
      fallbackGroup.visible = false;
    },
  );
  const jumpscare = new JumpscareOverlay(
    scene,
    camera,
    mode === 'raid' ? null : publicUrl('assets/jumpscare-face.png'),
  );

  scene.add(new THREE.AmbientLight(0xffffff, AMBIENT_INTENSITY));

  // 手電筒：從視點射出，方向由 lightTarget 決定（Flashlight 每幀更新）
  const spotlight = new THREE.SpotLight(
    0xfff2d8,
    LIGHT_INTENSITY,
    30,
    LIGHT_ANGLE,
    LIGHT_PENUMBRA,
    LIGHT_DECAY,
  );
  spotlight.position.copy(VIEWPOINT);
  const lightTarget = new THREE.Object3D();
  scene.add(lightTarget);
  spotlight.target = lightTarget;
  scene.add(spotlight);

  const resize = (): void => {
    camera.aspect = innerWidth / innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(innerWidth, innerHeight);
    projectionWarp.resize(innerWidth, innerHeight, renderer.getPixelRatio());
    cinematic.resize(innerWidth, innerHeight);
    jumpscare.resize(innerWidth, innerHeight);
  };
  resize();

  return {
    scene,
    camera,
    renderer,
    spotlight,
    lightTarget,
    actors: { portrait, silhouette },
    cinematic,
    jumpscare,
    setProjectionCorners: (corners) => projectionWarp.setCorners(corners),
    setPixelRatioLimit: (limit) => {
      pixelRatioLimit = Math.max(0.75, Math.min(2, limit));
      renderer.setPixelRatio(Math.min(devicePixelRatio, pixelRatioLimit));
      resize();
    },
    resize,
    render: () => projectionWarp.render(scene, camera),
  };
}
