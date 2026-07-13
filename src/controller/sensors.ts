// 陀螺儀讀取：權限流程（iOS 需使用者手勢觸發）、deviceorientation 監聽、
// rAF 節流輸出指向四元數（含 recenter yaw 修正）。

import type { Quaternion } from 'three';
import {
  anglesToPointingQuaternion,
  applyYawCorrection,
  yawCorrectionFor,
  type DeviceAngles,
} from '../shared/orientation';

export type PermissionResult = 'granted' | 'denied' | 'unsupported';

/** 必須在使用者手勢（點擊）的呼叫堆疊內執行，否則 iOS 直接 reject */
export async function requestOrientationPermission(): Promise<PermissionResult> {
  if (typeof DeviceOrientationEvent === 'undefined') return 'unsupported';
  const request = (
    DeviceOrientationEvent as unknown as {
      requestPermission?: () => Promise<'granted' | 'denied'>;
    }
  ).requestPermission;
  if (typeof request !== 'function') return 'granted'; // Android / 桌機：無權限關卡
  try {
    return (await request()) === 'granted' ? 'granted' : 'denied';
  } catch {
    return 'denied';
  }
}

function screenAngle(): number {
  return screen.orientation?.angle ?? 0;
}

export class OrientationStream {
  private angles: DeviceAngles | null = null;
  private yawCorrection = 0;
  private rafId = 0;
  private readonly onOrientation = (ev: DeviceOrientationEvent) => {
    if (ev.alpha === null || ev.beta === null || ev.gamma === null) return; // 桌機常見：事件有來但值全 null
    this.angles = {
      alpha: ev.alpha,
      beta: ev.beta,
      gamma: ev.gamma,
      screenAngle: screenAngle(),
    };
  };

  /** 開始監聽並以 rAF 頻率回呼指向四元數（尚無感測資料時不回呼） */
  start(onQuat: (q: Quaternion) => void): void {
    window.addEventListener('deviceorientation', this.onOrientation);
    const tick = () => {
      if (this.angles) {
        onQuat(applyYawCorrection(anglesToPointingQuaternion(this.angles), this.yawCorrection));
      }
      this.rafId = requestAnimationFrame(tick);
    };
    this.rafId = requestAnimationFrame(tick);
  }

  /** 把「現在指的方向」設為畫面正中（只修 yaw） */
  recenter(): void {
    if (!this.angles) return;
    this.yawCorrection = yawCorrectionFor(anglesToPointingQuaternion(this.angles));
  }

  /** 已收到有效感測資料 */
  get hasData(): boolean {
    return this.angles !== null;
  }

  stop(): void {
    window.removeEventListener('deviceorientation', this.onOrientation);
    cancelAnimationFrame(this.rafId);
    this.angles = null;
  }
}
