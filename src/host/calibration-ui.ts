import {
  cloneCorners,
  DEFAULT_PROJECTION_CORNERS,
  isProjectionCorners,
  parseProjectionCorners,
  type CornerId,
  type ProjectionCorners,
} from '../shared/calibration';

const STORAGE_KEY = 'corner-horror:projection-corners:v1';
const CORNER_IDS: CornerId[] = ['tl', 'tr', 'br', 'bl'];

export interface CalibrationUi {
  corners: ProjectionCorners;
  toggle(): void;
}

export function createCalibrationUi(onChange: (corners: ProjectionCorners) => void): CalibrationUi {
  const layer = document.querySelector<HTMLDivElement>('#calibration-layer')!;
  const toggleButton = document.querySelector<HTMLButtonElement>('#calibrate')!;
  const doneButton = document.querySelector<HTMLButtonElement>('#calibration-done')!;
  const resetButton = document.querySelector<HTMLButtonElement>('#calibration-reset')!;
  const handles = new Map<CornerId, HTMLButtonElement>();
  const lines = CORNER_IDS.map(() => {
    const line = document.createElement('div');
    line.className = 'calibration-line';
    layer.append(line);
    return line;
  });

  let corners = parseProjectionCorners(localStorage.getItem(STORAGE_KEY)) ?? cloneCorners(DEFAULT_PROJECTION_CORNERS);
  let active = false;

  function render(): void {
    for (const id of CORNER_IDS) {
      const point = corners[id];
      const handle = handles.get(id)!;
      handle.style.left = `${point.x * 100}%`;
      handle.style.top = `${point.y * 100}%`;
    }
    for (let index = 0; index < CORNER_IDS.length; index++) {
      const start = corners[CORNER_IDS[index]!]!;
      const end = corners[CORNER_IDS[(index + 1) % CORNER_IDS.length]!]!;
      const dx = (end.x - start.x) * innerWidth;
      const dy = (end.y - start.y) * innerHeight;
      const line = lines[index]!;
      line.style.left = `${start.x * 100}%`;
      line.style.top = `${start.y * 100}%`;
      line.style.width = `${Math.hypot(dx, dy)}px`;
      line.style.transform = `rotate(${Math.atan2(dy, dx)}rad)`;
    }
  }

  function commit(next: ProjectionCorners): void {
    if (!isProjectionCorners(next)) return;
    corners = cloneCorners(next);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(corners));
    onChange(corners);
    render();
  }

  function setActive(next: boolean): void {
    active = next;
    layer.classList.toggle('active', active);
    toggleButton.setAttribute('aria-pressed', String(active));
    toggleButton.textContent = active ? '校正中' : '投影校正';
    render();
  }

  for (const id of CORNER_IDS) {
    const handle = document.createElement('button');
    handle.type = 'button';
    handle.className = 'calibration-handle';
    handle.dataset.corner = id;
    handle.setAttribute('aria-label', `投影角點 ${id.toUpperCase()}`);
    handle.textContent = id.toUpperCase();
    handles.set(id, handle);
    layer.append(handle);

    handle.addEventListener('pointerdown', (event) => {
      handle.setPointerCapture(event.pointerId);
    });
    handle.addEventListener('pointermove', (event) => {
      if (!handle.hasPointerCapture(event.pointerId)) return;
      const next = cloneCorners(corners);
      next[id] = {
        x: Math.min(1, Math.max(0, event.clientX / innerWidth)),
        y: Math.min(1, Math.max(0, event.clientY / innerHeight)),
      };
      commit(next);
    });
  }

  toggleButton.addEventListener('click', () => setActive(!active));
  doneButton.addEventListener('click', () => setActive(false));
  resetButton.addEventListener('click', () => commit(cloneCorners(DEFAULT_PROJECTION_CORNERS)));
  window.addEventListener('resize', render);
  window.addEventListener('keydown', (event) => {
    if (event.key.toLowerCase() === 'c' && !event.repeat) setActive(!active);
    if (event.key === 'Escape' && active) setActive(false);
  });

  onChange(corners);
  render();
  return {
    get corners() {
      return cloneCorners(corners);
    },
    toggle: () => setActive(!active),
  };
}

