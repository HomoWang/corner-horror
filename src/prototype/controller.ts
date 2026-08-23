import { parseMessage, type ProtoItemId } from '../shared/protocol';
import { publicUrl } from '../shared/public-url';
import { buildWebSocketUrl, normalizeRoomCode } from '../shared/session';

const statusEl = document.querySelector<HTMLParagraphElement>('#status')!;
const sensorStatusEl = document.querySelector<HTMLParagraphElement>('#sensor-status')!;
const selectedEl = document.querySelector<HTMLParagraphElement>('#selected')!;
const startBtn = document.querySelector<HTMLButtonElement>('#start')!;
const inventoryGridEl = document.querySelector<HTMLDivElement>('#phone-inventory')!;
const joystickEl = document.querySelector<HTMLDivElement>('#joystick')!;
const stickEl = document.querySelector<HTMLDivElement>('#stick')!;
const calibrateBtn = document.querySelector<HTMLButtonElement>('#calibrate')!;

const itemPresentation: Record<ProtoItemId, { label: string; image: string }> = {
  receipt: { label: '收據', image: publicUrl('assets/inventory-icons/receipt.png') },
  pencil: { label: '短鉛筆', image: publicUrl('assets/inventory-icons/pencil-environment.png') },
  tape: { label: '錄音磁帶', image: publicUrl('assets/inventory-icons/cassette-environment.png') },
  oldBattery: { label: '舊電池', image: publicUrl('assets/inventory-icons/battery-environment.png') },
  smallKey: { label: '鑰匙', image: publicUrl('assets/inventory-icons/key-user.png') },
  pendant: { label: '錄音吊飾', image: publicUrl('assets/inventory-icons/pendant-user.png') },
  photo: { label: '合照', image: publicUrl('assets/room307/photos/男女主角照片.png') },
  antenna: { label: '脫落的天線', image: publicUrl('assets/inventory-icons/antenna.png') },
};

type HapticPattern = number | number[];

const isAppleTouchDevice =
  /iPhone|iPad|iPod/.test(navigator.userAgent) ||
  (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);

let iosHapticLabel: HTMLLabelElement | null = null;
let iosHapticTimers: number[] = [];
let errorFeedbackTimer: number | null = null;

function ensureIosHapticLabel(): HTMLLabelElement {
  if (iosHapticLabel) return iosHapticLabel;

  const label = document.createElement('label');
  label.className = 'programmatic-haptic-trigger';
  label.setAttribute('aria-hidden', 'true');

  const input = document.createElement('input');
  input.type = 'checkbox';
  input.tabIndex = -1;
  input.setAttribute('switch', '');
  label.append(input);
  document.body.append(label);
  iosHapticLabel = label;
  return label;
}

function clearIosHapticTimers(): void {
  iosHapticTimers.forEach((timer) => window.clearTimeout(timer));
  iosHapticTimers = [];
}

function triggerHaptic(pattern: HapticPattern, useIosFallback = true): void {
  navigator.vibrate?.(pattern);
  if (!useIosFallback || !isAppleTouchDevice) return;

  clearIosHapticTimers();
  const sequence = Array.isArray(pattern) ? pattern : [pattern];
  let elapsed = 0;

  sequence.forEach((duration, index) => {
    if (index % 2 === 0 && duration > 0) {
      const timer = window.setTimeout(() => ensureIosHapticLabel().click(), elapsed);
      iosHapticTimers.push(timer);
    }
    elapsed += Math.max(0, duration);
  });
}

function isPuzzleErrorPattern(pattern: HapticPattern): boolean {
  return (
    Array.isArray(pattern) &&
    pattern.length === 3 &&
    pattern[0] === 220 &&
    pattern[1] === 130 &&
    pattern[2] === 220
  );
}

function playPuzzleErrorFeedback(): void {
  document.body.classList.remove('puzzle-error-feedback');
  void document.body.offsetWidth;
  document.body.classList.add('puzzle-error-feedback');
  if (errorFeedbackTimer !== null) window.clearTimeout(errorFeedbackTimer);
  errorFeedbackTimer = window.setTimeout(() => {
    document.body.classList.remove('puzzle-error-feedback');
    errorFeedbackTimer = null;
  }, 820);
}

const roomCode = normalizeRoomCode(new URLSearchParams(location.search).get('room'));
let ws: WebSocket | null = null;
let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
let reconnectEnabled = true;
let orientation = { pitch: 0, yaw: 0, roll: 0, hasData: false };
let center = { pitch: 0, yaw: 0, roll: 0 };
let sensorsBound = false;
let lastOrientationEventAt = 0;
let awaitingSensorCenter = false;
let joystickPointerId: number | null = null;
let joystickTapCandidate = false;
let joystickStartedInCenter = false;
let joystickMovementStarted = false;
let joystickInteractHeld = false;
let joystickStart = { x: 0, y: 0, time: 0 };
let calibrationSamples: Array<{ pitch: number; yaw: number; roll: number }> = [];
let calibrating = false;
let controllerSlots: Array<ProtoItemId | null> = Array.from({ length: 6 }, () => null);
let selectedItem: ProtoItemId | null = null;
let detailItem: ProtoItemId | null = null;
let interfaceWasOpen = false;
let smoothedPointer = { x: 0, y: 0 };
const viewPointerResponse = {
  x: { range: 24, deadZone: 0.1, curve: 1.08 },
  y: { range: 24, deadZone: 0.1, curve: 1.08 },
};
const interfacePointerResponse = viewPointerResponse;
let itemPress:
  | {
      item: ProtoItemId;
      pointerId: number;
      startX: number;
      startY: number;
      longPressed: boolean;
      timer: ReturnType<typeof setTimeout>;
    }
  | null = null;

function setStatus(text: string): void {
  statusEl.textContent = text;
}

function setSensorStatus(text: string, state: 'idle' | 'waiting' | 'active' | 'error'): void {
  sensorStatusEl.textContent = text;
  sensorStatusEl.dataset.state = state;
}

function send(payload: unknown): void {
  if (ws?.readyState === WebSocket.OPEN) ws.send(JSON.stringify(payload));
}

function clamp(value: number): number {
  return Math.max(-1, Math.min(1, value));
}

function getScreenAngle(): number {
  const legacyOrientation = (window as Window & { orientation?: number }).orientation;
  const angle = screen.orientation?.angle ?? legacyOrientation ?? 0;
  return ((angle % 360) + 360) % 360;
}

function alignOrientationToScreen(beta: number, gamma: number): { beta: number; gamma: number } {
  switch (getScreenAngle()) {
    case 90:
      return { beta: -gamma, gamma: beta };
    case 180:
      return { beta: -beta, gamma: -gamma };
    case 270:
      return { beta: gamma, gamma: -beta };
    default:
      return { beta, gamma };
  }
}

function updateOrientationLayout(): void {
  const angle = getScreenAngle();
  const correction = angle === 270 ? '90deg' : '-90deg';
  document.documentElement.style.setProperty('--controller-rotation', correction);
}

async function lockPortraitOrientation(): Promise<void> {
  const orientationApi = screen.orientation as ScreenOrientation & {
    lock?: (orientation: string) => Promise<void>;
  };
  if (typeof orientationApi?.lock !== 'function') return;
  try {
    await orientationApi.lock('portrait-primary');
  } catch {
    try {
      await orientationApi.lock('portrait');
    } catch {
      // iPhone Safari 不提供鎖定權限，CSS 會維持直向畫布。
    }
  }
}

function renderPhoneInventory(): void {
  if (inventoryGridEl.children.length !== 6) {
    inventoryGridEl.replaceChildren();
    for (let index = 0; index < 6; index += 1) {
      const slot = document.createElement('label');
      slot.dataset.slot = String(index);
      const hapticSurface = document.createElement('input');
      hapticSurface.type = 'checkbox';
      hapticSurface.tabIndex = -1;
      hapticSurface.className = 'ios-haptic-surface';
      hapticSurface.setAttribute('switch', '');
      const icon = document.createElement('img');
      icon.className = 'item-icon';
      icon.alt = '';
      icon.draggable = false;
      const name = document.createElement('span');
      name.className = 'item-name';
      slot.append(hapticSurface, icon, name);
      inventoryGridEl.append(slot);
    }
  }

  const slots = inventoryGridEl.querySelectorAll<HTMLLabelElement>('[data-slot]');
  slots.forEach((slot, index) => {
    const item = controllerSlots[index];
    const hapticSurface = slot.querySelector<HTMLInputElement>('.ios-haptic-surface')!;
    const icon = slot.querySelector<HTMLImageElement>('.item-icon')!;
    const name = slot.querySelector<HTMLElement>('.item-name')!;
    slot.className = [
      'inventory-slot',
      item ? '' : 'empty',
      item && selectedItem === item ? 'selected' : '',
      item && detailItem === item ? 'detail' : '',
    ]
      .filter(Boolean)
      .join(' ');

    if (!item) {
      hapticSurface.disabled = true;
      delete slot.dataset.item;
      slot.setAttribute('aria-disabled', 'true');
      slot.setAttribute('aria-label', `空物品格 ${index + 1}`);
      icon.hidden = true;
      icon.removeAttribute('src');
      name.textContent = '';
      return;
    }

    hapticSurface.disabled = false;
    slot.dataset.item = item;
    slot.setAttribute('aria-disabled', 'false');
    slot.setAttribute(
      'aria-label',
      `${itemPresentation[item].label}，單點使用，長按查看詳細資料`,
    );
    icon.hidden = false;
    icon.src = itemPresentation[item].image;
    name.textContent = itemPresentation[item].label;
  });

  selectedEl.textContent = `使用中：${selectedItem ? itemPresentation[selectedItem].label : '無'}`;
}

function clearItemPress(): void {
  if (!itemPress) return;
  clearTimeout(itemPress.timer);
  itemPress = null;
  inventoryGridEl.querySelector('.pressing')?.classList.remove('pressing');
}

function connect(): void {
  if (!reconnectEnabled) return;
  if (ws?.readyState === WebSocket.OPEN || ws?.readyState === WebSocket.CONNECTING) return;
  if (!roomCode) {
    setStatus('缺少房間代碼，請重新掃描 QR Code。');
    return;
  }
  let endpoint: string;
  try {
    endpoint = buildWebSocketUrl(roomCode, import.meta.env.VITE_WS_URL, location.href);
  } catch {
    setStatus('WebSocket URL 建立失敗。');
    return;
  }
  const socket = new WebSocket(endpoint);
  ws = socket;

  socket.addEventListener('open', () => {
    socket.send(JSON.stringify({ type: 'hello', role: 'controller' }));
    setStatus('已連線，請點同步。');
  });

  socket.addEventListener('message', (event) => {
    const msg = parseMessage(event.data);
    if (!msg) return;
    if (msg.type === 'kick') {
      reconnectEnabled = false;
      setStatus('另一支手機已接管控制。');
      socket.close();
      return;
    }
    if (msg.type === 'proto-vibrate') {
      triggerHaptic(msg.pattern);
      if (isPuzzleErrorPattern(msg.pattern)) playPuzzleErrorFeedback();
    }
    if (msg.type === 'proto-controller-state') {
      interfaceWasOpen = msg.inventoryOpen;
      controllerSlots = [...msg.slots];
      selectedItem = msg.selectedItem ?? null;
      detailItem = msg.detailItem ?? null;
      document.body.dataset.inventory = String(msg.inventoryOpen);
      renderPhoneInventory();
    }
  });

  socket.addEventListener('close', () => {
    if (ws === socket) ws = null;
    if (!reconnectEnabled) return;
    if (reconnectTimer) return;
    setStatus('連線中斷，正在重連。');
    reconnectTimer = setTimeout(() => {
      reconnectTimer = null;
      connect();
    }, 1000);
  });
}

type PermissionAwareSensorConstructor = {
  requestPermission?: () => Promise<'granted' | 'denied'>;
};

async function requestSensorPermission(
  sensorConstructor: PermissionAwareSensorConstructor | undefined,
): Promise<boolean> {
  if (!sensorConstructor) return false;
  if (typeof sensorConstructor.requestPermission !== 'function') return true;
  try {
    // Safari expects requestPermission to be called with its constructor as `this`.
    return (await sensorConstructor.requestPermission.call(sensorConstructor)) === 'granted';
  } catch {
    return false;
  }
}

async function requestSensorPermissions(): Promise<boolean> {
  const orientationConstructor =
    typeof DeviceOrientationEvent === 'undefined'
      ? undefined
      : (DeviceOrientationEvent as unknown as PermissionAwareSensorConstructor);
  const motionConstructor =
    typeof DeviceMotionEvent === 'undefined'
      ? undefined
      : (DeviceMotionEvent as unknown as PermissionAwareSensorConstructor);
  // Both permission calls must begin inside the same physical tap on iOS.
  // Waiting for one before requesting the other can consume the user gesture.
  const orientationRequest = requestSensorPermission(orientationConstructor);
  const motionRequest = requestSensorPermission(motionConstructor);
  const [orientationAllowed, motionAllowed] = await Promise.all([
    orientationRequest,
    motionRequest,
  ]);
  return orientationAllowed || motionAllowed;
}

function acceptSensorSample(pitch: number, yaw: number, roll: number): void {
  const sample = { pitch, yaw, roll };
  orientation = { ...sample, hasData: true };
  setSensorStatus('方向感應：正常', 'active');
  if (calibrating) calibrationSamples.push(sample);
  if (!calibrating && awaitingSensorCenter) {
    awaitingSensorCenter = false;
    center = { ...sample };
    smoothedPointer = { x: 0, y: 0 };
    triggerHaptic(35);
    setStatus('方向感應已啟用。');
  }
}

function handleOrientation(event: DeviceOrientationEvent): void {
  if (event.beta === null) return;
  const screenAligned = alignOrientationToScreen(event.beta, event.gamma ?? 0);
  const iosHeading = (event as DeviceOrientationEvent & { webkitCompassHeading?: number })
    .webkitCompassHeading;
  const rawYaw = Number.isFinite(iosHeading)
    ? (iosHeading as number)
    : event.alpha;
  lastOrientationEventAt = performance.now();
  // Safari sometimes exposes beta/gamma while alpha remains null. Keep the
  // roll value as a horizontal fallback so the cursor never becomes frozen.
  acceptSensorSample(
    screenAligned.beta,
    rawYaw ?? screenAligned.gamma,
    screenAligned.gamma,
  );
}

function handleMotion(event: DeviceMotionEvent): void {
  // Device orientation is more precise. Gravity is only used when Safari does
  // not provide orientation events on this device.
  if (performance.now() - lastOrientationEventAt < 700) return;
  const gravity = event.accelerationIncludingGravity;
  if (
    gravity?.x === null ||
    gravity?.y === null ||
    gravity?.z === null ||
    gravity?.x === undefined ||
    gravity?.y === undefined ||
    gravity?.z === undefined
  ) {
    return;
  }
  const beta = Math.atan2(-gravity.y, gravity.z) * (180 / Math.PI);
  const gamma = Math.atan2(gravity.x, Math.hypot(gravity.y, gravity.z)) * (180 / Math.PI);
  const screenAligned = alignOrientationToScreen(beta, gamma);
  // Gravity cannot measure yaw. On browsers without orientation events,
  // left/right tilt remains a usable fallback.
  acceptSensorSample(screenAligned.beta, screenAligned.gamma, screenAligned.gamma);
}

function bindSensorListeners(): void {
  if (sensorsBound) return;
  sensorsBound = true;
  window.addEventListener('deviceorientation', handleOrientation, { passive: true });
  window.addEventListener(
    'deviceorientationabsolute',
    handleOrientation as EventListener,
    { passive: true },
  );
  window.addEventListener('devicemotion', handleMotion, { passive: true });
}

function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.floor(sorted.length / 2)] ?? 0;
}

async function calibrateAccurately(): Promise<void> {
  if (calibrating) return;
  calibrating = true;
  awaitingSensorCenter = false;
  calibrationSamples = [];
  setStatus('請對準電腦畫面中央，保持不動……');
  await new Promise((resolve) => setTimeout(resolve, 900));
  calibrating = false;

  if (calibrationSamples.length < 3) {
    awaitingSensorCenter = true;
    setSensorStatus('方向感應：未收到資料', 'error');
    setStatus('沒有取得方向資料，請用 Safari 並允許動作權限。');
    return;
  }

  center = {
    pitch: median(calibrationSamples.map((sample) => sample.pitch)),
    yaw: medianAngle(calibrationSamples.map((sample) => sample.yaw)),
    roll: median(calibrationSamples.map((sample) => sample.roll)),
  };
  awaitingSensorCenter = false;
  smoothedPointer = { x: 0, y: 0 };
  triggerHaptic(35);
  setSensorStatus('方向感應：正常', 'active');
  setStatus('中心已鎖定。');
}

function normalizeAxis(
  delta: number,
  response: { range: number; deadZone: number; curve: number },
): number {
  const { range, deadZone, curve } = response;
  const magnitude = Math.abs(delta);
  if (magnitude <= deadZone) return 0;
  const normalized = Math.min(1, (magnitude - deadZone) / (range - deadZone));
  return Math.sign(delta) * normalized ** curve;
}

function angleDelta(value: number, origin: number): number {
  return ((value - origin + 540) % 360) - 180;
}

function medianAngle(values: number[]): number {
  if (values.length === 0) return 0;
  const origin = values[0] ?? 0;
  return origin + median(values.map((value) => angleDelta(value, origin)));
}

function smoothPointerAxis(current: number, target: number, interfaceMode: boolean): number {
  if (target === 0) {
    const stopped = current * (interfaceMode ? 0.78 : 0.74);
    return Math.abs(stopped) < 0.001 ? 0 : stopped;
  }

  const difference = target - current;
  const distance = Math.abs(difference);
  const blend = interfaceMode
    ? distance > 0.12 ? 0.24 : 0.14
    : distance > 0.15 ? 0.28 : 0.16;
  return current + difference * blend;
}

function sendPointerLoop(): void {
  if (
    document.body.classList.contains('started') &&
    orientation.hasData
  ) {
    const response = interfaceWasOpen ? interfacePointerResponse : viewPointerResponse;
    // Portrait phones point left/right by rotating around their screen's Y axis.
    // Compass heading is deliberately excluded: iOS magnetometer corrections made
    // the cursor pause or jump even while the phone itself moved continuously.
    const targetX = normalizeAxis(orientation.roll - center.roll, response.x);
    const targetY = normalizeAxis(angleDelta(orientation.pitch, center.pitch), response.y);
    smoothedPointer = {
      x: smoothPointerAxis(smoothedPointer.x, targetX, interfaceWasOpen),
      y: smoothPointerAxis(smoothedPointer.y, targetY, interfaceWasOpen),
    };
    send({ type: 'proto-pointer', ...smoothedPointer, t: Date.now() });
  }
  requestAnimationFrame(sendPointerLoop);
}

async function start(): Promise<void> {
  triggerHaptic(25);
  if (!window.isSecureContext) {
    document.body.classList.add('started');
    send({ type: 'ready' });
    setSensorStatus('方向感應：需要安全連線', 'error');
    setStatus('方向感應需要 HTTPS，請重新掃描電腦畫面上的安全 QR Code。');
    return;
  }
  bindSensorListeners();
  setSensorStatus('方向感應：等待授權', 'waiting');
  const permissionPromise = requestSensorPermissions();
  void lockPortraitOrientation();
  const allowed = await permissionPromise;
  document.body.classList.add('started');
  send({ type: 'ready' });
  if (allowed) {
    setSensorStatus('方向感應：等待資料', 'waiting');
    await calibrateAccurately();
  } else {
    setSensorStatus('方向感應：權限未開啟', 'error');
    setStatus('此瀏覽器沒有方向感測權限，請用手機瀏覽器重新開啟。');
  }
}

function updateJoystick(clientX: number, clientY: number): void {
  const rect = joystickEl.getBoundingClientRect();
  const cx = rect.left + rect.width / 2;
  const cy = rect.top + rect.height / 2;
  const radius = rect.width / 2;
  const dx = clamp((clientX - cx) / radius);
  const dy = clamp((clientY - cy) / radius);
  const length = Math.min(1, Math.hypot(dx, dy));
  const angle = Math.atan2(dy, dx);
  const x = Math.cos(angle) * length;
  const y = Math.sin(angle) * length;
  stickEl.style.transform = `translate(calc(-50% + ${x * radius * 0.48}px), calc(-50% + ${y * radius * 0.48}px))`;
  send({ type: 'proto-move', x, y });
}

function resetJoystick(): void {
  stickEl.style.transform = 'translate(-50%, -50%)';
  send({ type: 'proto-move', x: 0, y: 0 });
}

startBtn.addEventListener('click', () => void start());
calibrateBtn.addEventListener('click', () => {
  void (async () => {
    bindSensorListeners();
    setSensorStatus('方向感應：等待授權', 'waiting');
    const permissionPromise = requestSensorPermissions();
    void lockPortraitOrientation();
    const allowed = await permissionPromise;
    if (allowed) {
      setSensorStatus('方向感應：等待資料', 'waiting');
      await calibrateAccurately();
    } else {
      setSensorStatus('方向感應：權限未開啟', 'error');
    }
  })();
});

inventoryGridEl.addEventListener('contextmenu', (event) => event.preventDefault());
inventoryGridEl.addEventListener('pointerdown', (event) => {
  const slot = (event.target as HTMLElement).closest<HTMLLabelElement>('[data-item]');
  const item = slot?.dataset.item as ProtoItemId | undefined;
  if (!slot || !item) return;
  clearItemPress();
  slot.setPointerCapture(event.pointerId);
  slot.classList.add('pressing');
  const press = {
    item,
    pointerId: event.pointerId,
    startX: event.clientX,
    startY: event.clientY,
    longPressed: false,
    timer: setTimeout(() => {
      if (itemPress !== press) return;
      press.longPressed = true;
      triggerHaptic(45, false);
      send({ type: 'proto-item-action', item, action: 'inspect' });
    }, 520),
  };
  itemPress = press;
});

inventoryGridEl.addEventListener('pointermove', (event) => {
  if (!itemPress || event.pointerId !== itemPress.pointerId) return;
  if (Math.hypot(event.clientX - itemPress.startX, event.clientY - itemPress.startY) > 12) {
    clearItemPress();
  }
});

function finishItemPress(event: PointerEvent): void {
  if (!itemPress || event.pointerId !== itemPress.pointerId) return;
  const { item, longPressed } = itemPress;
  clearItemPress();
  if (event.type === 'pointerup' && !longPressed) {
    triggerHaptic(22, false);
    send({ type: 'proto-item-action', item, action: 'use' });
  }
}

inventoryGridEl.addEventListener('pointerup', finishItemPress);
inventoryGridEl.addEventListener('pointercancel', finishItemPress);

joystickEl.addEventListener('pointerdown', (event) => {
  if (joystickPointerId !== null) return;
  event.preventDefault();
  const rect = joystickEl.getBoundingClientRect();
  const centerX = rect.left + rect.width / 2;
  const centerY = rect.top + rect.height / 2;
  joystickStartedInCenter =
    Math.hypot(event.clientX - centerX, event.clientY - centerY) <= rect.width * 0.19;
  joystickTapCandidate = joystickStartedInCenter;
  joystickInteractHeld = joystickTapCandidate;
  if (joystickInteractHeld) send({ type: 'proto-use', pressed: true });
  joystickMovementStarted = false;
  joystickStart = { x: event.clientX, y: event.clientY, time: performance.now() };
  joystickPointerId = event.pointerId;
  joystickEl.setPointerCapture(event.pointerId);
  resetJoystick();
});

joystickEl.addEventListener('pointermove', (event) => {
  if (event.pointerId !== joystickPointerId) return;
  event.preventDefault();
  if (interfaceWasOpen) {
    if (!joystickStartedInCenter) return;
    const dragDistance = Math.hypot(
      event.clientX - joystickStart.x,
      event.clientY - joystickStart.y,
    );
    const dragThreshold = Math.max(42, joystickEl.getBoundingClientRect().width * 0.19);
    if (!joystickMovementStarted && dragDistance <= dragThreshold) return;
    if (!joystickMovementStarted) {
      joystickMovementStarted = true;
      joystickTapCandidate = false;
      if (joystickInteractHeld) {
        joystickInteractHeld = false;
        send({ type: 'proto-use', pressed: false });
      }
    }
    return;
  }
  if (!joystickStartedInCenter) return;
  const dragDistance = Math.hypot(
    event.clientX - joystickStart.x,
    event.clientY - joystickStart.y,
  );
  const dragThreshold = Math.max(42, joystickEl.getBoundingClientRect().width * 0.19);
  if (!joystickMovementStarted && dragDistance <= dragThreshold) {
    return;
  }
  if (!joystickMovementStarted) {
    joystickMovementStarted = true;
    joystickTapCandidate = false;
    if (joystickInteractHeld) {
      joystickInteractHeld = false;
      send({ type: 'proto-use', pressed: false });
    }
  }
  updateJoystick(event.clientX, event.clientY);
});

function endJoystick(event: PointerEvent): void {
  if (event.pointerId !== joystickPointerId) return;
  event.preventDefault();
  const didMove = joystickMovementStarted;
  const dragX = event.clientX - joystickStart.x;
  const dragY = event.clientY - joystickStart.y;
  const dragDistance = Math.hypot(dragX, dragY);
  const navigationThreshold = Math.max(58, joystickEl.getBoundingClientRect().width * 0.26);
  const shouldInteract =
    event.type === 'pointerup' &&
    joystickTapCandidate &&
    performance.now() - joystickStart.time <= 350;
  if (joystickInteractHeld) send({ type: 'proto-use', pressed: false });
  joystickInteractHeld = false;
  joystickPointerId = null;
  joystickTapCandidate = false;
  const startedInCenter = joystickStartedInCenter;
  joystickStartedInCenter = false;
  joystickMovementStarted = false;
  if (joystickEl.hasPointerCapture(event.pointerId)) {
    joystickEl.releasePointerCapture(event.pointerId);
  }
  resetJoystick();
  if (
    event.type === 'pointerup' &&
    (didMove || dragDistance >= navigationThreshold) &&
    startedInCenter &&
    dragDistance >= navigationThreshold
  ) {
    if (interfaceWasOpen) {
      if (dragY > 0 && Math.abs(dragY) > Math.abs(dragX)) {
        send({ type: 'proto-navigate', direction: 'back' });
        triggerHaptic(28, false);
      }
    } else {
      const direction = Math.abs(dragX) > Math.abs(dragY)
        ? dragX < 0
          ? 'left'
          : 'right'
        : dragY < 0
          ? 'forward'
          : 'back';
      send({ type: 'proto-navigate', direction });
      triggerHaptic(28, false);
    }
  }
  if (shouldInteract) {
    triggerHaptic(25, false);
    send({ type: 'proto-interact' });
  }
}

joystickEl.addEventListener('pointerup', endJoystick);
joystickEl.addEventListener('pointercancel', endJoystick);

let orientationChangeTimer: ReturnType<typeof setTimeout> | null = null;
function handleScreenOrientationChange(): void {
  updateOrientationLayout();
  if (!document.body.classList.contains('started')) return;
  if (orientationChangeTimer) clearTimeout(orientationChangeTimer);
  orientationChangeTimer = setTimeout(() => {
    orientationChangeTimer = null;
    void calibrateAccurately();
  }, 260);
}

window.addEventListener('orientationchange', handleScreenOrientationChange);
screen.orientation?.addEventListener('change', handleScreenOrientationChange);

let lastTouchEndAt = 0;
document.addEventListener(
  'touchend',
  (event) => {
    const now = performance.now();
    if (now - lastTouchEndAt < 420) event.preventDefault();
    lastTouchEndAt = now;
  },
  { passive: false },
);
document.addEventListener('dblclick', (event) => event.preventDefault());
document.addEventListener('gesturestart', (event) => event.preventDefault(), { passive: false });
document.addEventListener('gesturechange', (event) => event.preventDefault(), { passive: false });
document.addEventListener('gestureend', (event) => event.preventDefault(), { passive: false });

updateOrientationLayout();
connect();
renderPhoneInventory();
requestAnimationFrame(sendPointerLoop);
