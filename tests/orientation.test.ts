import { describe, expect, it } from 'vitest';
import {
  anglesToPointingQuaternion,
  applyYawCorrection,
  pointingVector,
  yawCorrectionFor,
  type DeviceAngles,
} from '../src/shared/orientation';

// 世界座標（three.js Y-up）：-Z = 北（正前）、+X = 東（右）、+Y = 上

function pointing(angles: Partial<DeviceAngles>) {
  const v = pointingVector(
    anglesToPointingQuaternion({ alpha: 0, beta: 0, gamma: 0, screenAngle: 0, ...angles }),
  );
  return [v.x, v.y, v.z];
}

function expectVec(actual: number[], expected: number[]) {
  for (let i = 0; i < 3; i++) expect(actual[i]).toBeCloseTo(expected[i]!, 6);
}

describe('anglesToPointingQuaternion（指向 = 手機頂邊）', () => {
  it('手機平放螢幕朝上、頂邊朝北 → 水平指向正前（遙控器式握法零仰角）', () => {
    expectVec(pointing({}), [0, 0, -1]);
  });

  it('alpha=90（平放逆時針轉 90°）→ 指向西（左）', () => {
    expectVec(pointing({ alpha: 90 }), [-1, 0, 0]);
  });

  it('beta=90（豎直、螢幕面向使用者）→ 頂邊指天', () => {
    expectVec(pointing({ beta: 90 }), [0, 1, 0]);
  });

  it('beta=45 → 上仰 45°', () => {
    expectVec(pointing({ beta: 45 }), [0, Math.SQRT1_2, -Math.SQRT1_2]);
  });

  it('gamma=90（沿長軸滾轉）不改變頂邊指向', () => {
    expectVec(pointing({ gamma: 90 }), [0, 0, -1]);
  });

  it('螢幕方向補償：裝置轉 90° 但螢幕同步轉 90°（橫向）→ 指向不變（以螢幕頂為準）', () => {
    expectVec(pointing({ alpha: 90, screenAngle: 90 }), [0, 0, -1]);
  });
});

describe('recenter（yaw 修正）', () => {
  it('指向東時歸中 → 指向轉回正前', () => {
    const q = anglesToPointingQuaternion({ alpha: -90, beta: 0, gamma: 0, screenAngle: 0 });
    expectVec([...pointingVector(q)], [1, 0, 0]); // 前置確認：alpha=-90 平放指東
    const corrected = applyYawCorrection(q, yawCorrectionFor(q));
    const v = pointingVector(corrected);
    expectVec([v.x, v.y, v.z], [0, 0, -1]);
  });

  it('只修 yaw：上仰 30°、偏右 45° 歸中後仰角保留、方位歸零', () => {
    const q = anglesToPointingQuaternion({ alpha: -45, beta: 30, gamma: 0, screenAngle: 0 });
    const corrected = applyYawCorrection(q, yawCorrectionFor(q));
    const v = pointingVector(corrected);
    expect(v.y).toBeCloseTo(Math.sin((30 * Math.PI) / 180), 6); // 仰角不變
    expect(v.x).toBeCloseTo(0, 6); // 方位歸零
    expect(v.z).toBeLessThan(0);
  });

  it('修正量套用後 yawCorrectionFor 歸零（冪等）', () => {
    const q = anglesToPointingQuaternion({ alpha: 123, beta: 10, gamma: 5, screenAngle: 0 });
    const corrected = applyYawCorrection(q, yawCorrectionFor(q));
    expect(yawCorrectionFor(corrected)).toBeCloseTo(0, 6);
  });
});
