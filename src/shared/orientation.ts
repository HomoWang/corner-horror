// 指向數學：deviceorientation 角度 → 指向四元數（three.js Y-up 世界）。
// 慣例：host 拿四元數套用到 (0,0,-1) 得到光錐方向；「指向軸」取手機頂邊
// （遙控器式握法——手機平放指牆即水平指向）。
// 公式沿用 three.js DeviceOrientationControls（W3C ZXY 內旋序 + 螢幕方向補償），
// 只在尾端多乘一個「-Z → 頂邊(+Y)」的軸轉換。

import { Euler, Quaternion, Vector3 } from 'three';

/** deviceorientation 事件角度（度）+ 螢幕方向角（度） */
export interface DeviceAngles {
  alpha: number;
  beta: number;
  gamma: number;
  screenAngle: number;
}

const DEG = Math.PI / 180;
const Z_AXIS = new Vector3(0, 0, 1);
/** 相機看向裝置背面（DeviceOrientationControls 的 q1：繞 X 軸 -90°） */
const Q_CAMERA = new Quaternion(-Math.sqrt(0.5), 0, 0, Math.sqrt(0.5));
/** 指向軸轉換：把 -Z 轉到裝置頂邊 +Y（繞 X 軸 +90°） */
const Q_TOP_EDGE = new Quaternion(Math.sqrt(0.5), 0, 0, Math.sqrt(0.5));

/** 角度 → 指向四元數：q 套用到 (0,0,-1) = 手機頂邊在世界中的方向 */
export function anglesToPointingQuaternion(a: DeviceAngles): Quaternion {
  const euler = new Euler(a.beta * DEG, a.alpha * DEG, -a.gamma * DEG, 'YXZ');
  const q = new Quaternion().setFromEuler(euler);
  q.multiply(Q_CAMERA);
  q.multiply(new Quaternion().setFromAxisAngle(Z_AXIS, -a.screenAngle * DEG));
  q.multiply(Q_TOP_EDGE);
  return q;
}

/** 指向向量（q 套用到 -Z） */
export function pointingVector(q: Quaternion): Vector3 {
  return new Vector3(0, 0, -1).applyQuaternion(q);
}

/**
 * Recenter 用的 yaw 修正量（rad）：套用後當下指向的方位角歸零（指向畫面正中）。
 * 只修 yaw——pitch 以重力為基準是可靠的絕對值，不該被歸零。
 */
export function yawCorrectionFor(q: Quaternion): number {
  const v = pointingVector(q);
  // 方位角：-Z 為 0、+X（右）為 +90°；繞世界 Y 轉 θ 會使方位角減少 θ，故修正量 = 方位角
  return Math.atan2(v.x, -v.z);
}

/** 世界座標 pre-multiply yaw 修正（繞世界 Y 軸） */
export function applyYawCorrection(q: Quaternion, yawRad: number): Quaternion {
  const correction = new Quaternion().setFromAxisAngle(new Vector3(0, 1, 0), yawRad);
  return correction.multiply(q);
}
