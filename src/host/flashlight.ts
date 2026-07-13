// 光錐方向控制：控制器四元數 → slerp 平滑 → SpotLight target；
// 斷線熄燈；無控制器時滑鼠 fallback。

import * as THREE from 'three';

/** 平滑速度：越大跟越緊（延遲低、抖動多）。1-exp(-dt*k) 幀率無關 */
const SMOOTHING_SPEED = 18;
/** 光錐 target 距離視點的長度（方向向量縮放用，值不影響照明結果） */
const TARGET_DISTANCE = 5;

const FORWARD = new THREE.Vector3(0, 0, -1);

export class Flashlight {
  private readonly current = new THREE.Quaternion();
  private readonly target = new THREE.Quaternion();
  private hasTarget = false;
  private connected = false;

  constructor(
    private readonly spotlight: THREE.SpotLight,
    private readonly lightTarget: THREE.Object3D,
    private readonly origin: THREE.Vector3,
  ) {
    this.spotlight.visible = false;
  }

  /** 控制器 orient 訊息進入點（協定：q 套用到 (0,0,-1) = 指向） */
  setTargetQuaternion(q: [number, number, number, number]): void {
    this.target.set(...q).normalize();
    if (!this.hasTarget) this.current.copy(this.target); // 首筆直接對齊，避免從原點掃過去
    this.hasTarget = true;
  }

  /** 控制器連線狀態：斷線熄燈 */
  setConnected(connected: boolean): void {
    this.connected = connected;
    if (!connected) this.hasTarget = false;
  }

  get isConnected(): boolean {
    return this.connected;
  }

  /** 滑鼠 fallback（僅無控制器時呼叫）：NDC 座標 → 指向 */
  pointAt(ndcX: number, ndcY: number, camera: THREE.Camera): void {
    const dir = new THREE.Vector3(ndcX, ndcY, 0.5)
      .unproject(camera)
      .sub(this.origin)
      .normalize();
    this.target.setFromUnitVectors(FORWARD, dir);
    if (!this.hasTarget) this.current.copy(this.target);
    this.hasTarget = true;
  }

  /** 每幀：平滑逼近目標方向並更新 SpotLight target */
  update(dt: number): void {
    this.spotlight.visible = this.hasTarget;
    if (!this.hasTarget) return;
    this.current.slerp(this.target, 1 - Math.exp(-dt * SMOOTHING_SPEED));
    const dir = FORWARD.clone().applyQuaternion(this.current);
    this.lightTarget.position.copy(this.origin).addScaledVector(dir, TARGET_DISTANCE);
  }

  /** 取得目前平滑後的光錐方向；尚未有輸入時回傳 false。 */
  getDirection(target: THREE.Vector3): boolean {
    if (!this.hasTarget) return false;
    target.copy(FORWARD).applyQuaternion(this.current).normalize();
    return true;
  }
}
