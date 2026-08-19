import { publicUrl } from '../shared/public-url';

export type RoomObjectId =
  | 'wardrobe'
  | 'wardrobeLeft'
  | 'wardrobeMiddle'
  | 'wardrobeRight'
  | 'receipt'
  | 'table'
  | 'pencil'
  | 'safe'
  | 'drawer'
  | 'tape'
  | 'oldBattery'
  | 'smallKey'
  | 'recorder'
  | 'door';

type WardrobeSection = 'left' | 'middle' | 'right';
type ViewId = 'wardrobe' | 'desk' | 'back' | 'bed';
type NavigationDirection = 'left' | 'right' | 'forward' | 'back';

interface VectorInput {
  x: number;
  y: number;
}

interface Hotspot {
  id: RoomObjectId;
  x: number;
  y: number;
  width: number;
  height: number;
  visible?: () => boolean;
}

const VIEW_ORDER: ViewId[] = ['wardrobe', 'desk', 'back', 'bed'];

const VIEW_IMAGES: Record<ViewId, string> = {
  wardrobe: publicUrl('assets/room407/photos/衣櫥.png'),
  desk: publicUrl('assets/room407/photos/desk-wall-dynamic-pencil-v2.png'),
  back: publicUrl('assets/room407/photos/back-wall-corrected-v2.png'),
  bed: publicUrl('assets/room407/photos/bed-door-wall.png'),
};

const WARDROBE_IMAGES = {
  closed: publicUrl('assets/room407/photos/衣櫥.png'),
  leftOpen: publicUrl('assets/room407/photos/wardrobe-left-consistent.png'),
  rightOpen: publicUrl('assets/room407/photos/wardrobe-right-repaired.png'),
  bothOpen: publicUrl('assets/room407/photos/wardrobe-both-repaired.png'),
} as const;

const VIEW_LABELS: Record<ViewId, string> = {
  wardrobe: '衣櫃與房門',
  desk: '書桌',
  back: '後方牆面',
  bed: '床與房門',
};

export class PrototypeRoom2D {
  private readonly image: HTMLImageElement;
  private readonly stateLayer: HTMLElement;
  private view: ViewId = 'wardrobe';
  private focused = false;
  private focusedTarget: RoomObjectId | null = null;
  private dragOffset = { x: 0, y: 0 };
  private wallSwitchTimer: number | null = null;
  private transitionSeconds = 0;
  private targetObject: RoomObjectId | null = null;
  private wardrobeOpen = new Set<WardrobeSection>();
  private safeOpen = false;
  private drawerOpen = false;
  private tapeInserted = false;
  private collected = new Set<RoomObjectId>();

  constructor(private readonly root: HTMLElement) {
    new Set([...Object.values(VIEW_IMAGES), ...Object.values(WARDROBE_IMAGES)]).forEach((src) => {
      const preload = new Image();
      preload.src = src;
    });

    this.image = document.createElement('img');
    this.image.id = 'room-background';
    this.image.alt = '407 房間';
    this.image.draggable = false;

    this.stateLayer = document.createElement('div');
    this.stateLayer.id = 'room-state-layer';
    this.root.replaceChildren(this.image, this.stateLayer);
    this.renderView();
  }

  resize(): void {}

  update(
    delta: number,
    _time: number,
    look: VectorInput,
    move: VectorInput,
    controlsEnabled: boolean,
  ): number {
    if (controlsEnabled) this.updateMovement(move, delta);
    else this.updateMovement({ x: 0, y: 0 }, delta);

    const scale = this.focused ? 1.075 : 1.055;
    this.root.style.setProperty('--scene-x', `${this.dragOffset.x * -5.2}%`);
    this.root.style.setProperty('--scene-y', `${this.dragOffset.y * -3.4}%`);
    this.root.style.setProperty('--scene-scale', String(scale));
    const focusedSpot = this.focusedTarget
      ? this.hotspots().find((spot) => spot.id === this.focusedTarget)
      : undefined;
    this.root.style.setProperty(
      '--scene-origin-x',
      focusedSpot ? `${(focusedSpot.x + focusedSpot.width / 2) * 100}%` : '50%',
    );
    this.root.style.setProperty(
      '--scene-origin-y',
      focusedSpot ? `${(focusedSpot.y + focusedSpot.height / 2) * 100}%` : '50%',
    );

    const aimX = 0.5 + look.x * 0.5;
    const aimY = 0.5 - look.y * 0.5;
    this.targetObject = this.findTarget(aimX, aimY)?.id ?? null;

    this.transitionSeconds = Math.max(0, this.transitionSeconds - delta);
    return this.transitionSeconds > 0 ? delta * 1.2 : 0;
  }

  getTargetObject(): RoomObjectId | null {
    return this.targetObject;
  }

  openWardrobe(section: WardrobeSection = 'left'): boolean {
    if (this.wardrobeOpen.has(section)) return false;
    this.wardrobeOpen.add(section);
    this.view = 'wardrobe';
    this.renderView();
    return true;
  }

  openSafe(): boolean {
    if (this.safeOpen) return false;
    this.safeOpen = true;
    this.renderState();
    return true;
  }

  openDrawer(): boolean {
    if (this.drawerOpen) return false;
    this.drawerOpen = true;
    this.view = 'desk';
    this.renderView();
    return true;
  }

  hasTapeInRecorder(): boolean {
    return this.tapeInserted;
  }

  insertTapeIntoRecorder(): boolean {
    if (this.tapeInserted) return false;
    this.tapeInserted = true;
    this.renderState();
    return true;
  }

  collectObject(objectId: RoomObjectId): void {
    this.collected.add(objectId);
    if (objectId === 'receipt' && this.view === 'wardrobe') this.renderView();
    else this.renderState();
  }

  navigate(direction: NavigationDirection): void {
    if (direction === 'forward') {
      const target = this.pickFocusTarget();
      this.focused = Boolean(target);
      this.focusedTarget = target?.id ?? null;
      this.transitionSeconds = 0.34;
      this.root.classList.toggle('focused', this.focused);
      return;
    }

    if (direction === 'back') {
      this.focused = false;
      this.focusedTarget = null;
      this.transitionSeconds = 0.34;
      this.root.classList.remove('focused');
      return;
    }

    const current = VIEW_ORDER.indexOf(this.view);
    const offset = direction === 'left' ? 1 : -1;
    this.dragOffset = { x: 0, y: 0 };
    this.root.classList.remove('dragging');
    this.root.classList.add('switching-wall');
    this.root.style.setProperty('--scene-x', '0%');
    this.root.style.setProperty('--scene-y', '0%');
    if (this.wallSwitchTimer !== null) window.clearTimeout(this.wallSwitchTimer);
    this.wallSwitchTimer = window.setTimeout(() => {
      this.root.classList.remove('switching-wall');
      this.wallSwitchTimer = null;
    }, 90);
    this.view = VIEW_ORDER[(current + offset + VIEW_ORDER.length) % VIEW_ORDER.length] ?? 'wardrobe';
    this.focused = false;
    this.focusedTarget = null;
    this.transitionSeconds = 0.48;
    this.root.classList.remove('focused');
    this.renderView();
  }

  private updateMovement(move: VectorInput, delta: number): void {
    const blend = 1 - Math.exp(-delta * 18);
    this.dragOffset.x += (move.x - this.dragOffset.x) * blend;
    this.dragOffset.y += (move.y - this.dragOffset.y) * blend;
    if (Math.abs(this.dragOffset.x) < 0.002) this.dragOffset.x = 0;
    if (Math.abs(this.dragOffset.y) < 0.002) this.dragOffset.y = 0;
    const dragging = Math.max(Math.abs(move.x), Math.abs(move.y)) > 0.025;
    this.root.classList.toggle('dragging', dragging);
  }

  private renderView(): void {
    const source = this.currentViewImage();
    this.image.src = source;
    this.root.style.backgroundImage = `url("${source}")`;
    this.root.dataset.view = this.view;
    this.root.setAttribute('aria-label', `407 房間：${VIEW_LABELS[this.view]}`);
    this.root.classList.add('changing-view');
    window.setTimeout(() => this.root.classList.remove('changing-view'), 260);
    this.renderState();
  }

  private currentViewImage(): string {
    if (this.view !== 'wardrobe') return VIEW_IMAGES[this.view];

    const leftOpen = this.wardrobeOpen.has('left') || this.wardrobeOpen.has('middle');
    const rightOpen = this.wardrobeOpen.has('right');
    if (leftOpen && rightOpen) return WARDROBE_IMAGES.bothOpen;
    if (rightOpen) return WARDROBE_IMAGES.rightOpen;
    if (leftOpen) return WARDROBE_IMAGES.leftOpen;
    return WARDROBE_IMAGES.closed;
  }

  private renderState(): void {
    const props: Array<{
      id: RoomObjectId;
      className: string;
      src: string;
      x: number;
      y: number;
      width: number;
    }> = [];
    const stateNodes: HTMLElement[] = [];

    if (
      this.view === 'wardrobe' &&
      this.wardrobeOpen.has('left') &&
      !this.collected.has('receipt')
    ) {
      props.push({
        id: 'receipt',
        className: 'receipt-prop',
        src: publicUrl('assets/room407/props/receipt-door.png'),
        x: 30.45,
        y: 35.25,
        width: 2.25,
      });
    }

    if (!this.collected.has('pencil')) {
      const pencilPlacement: Partial<Record<ViewId, { x: number; y: number; width: number }>> = {
        wardrobe: { x: 26.5, y: 55.3, width: 3.6 },
        desk: { x: 52.4, y: 58.5, width: 5.2 },
        back: { x: 91.2, y: 58.2, width: 3.8 },
      };
      const placement = pencilPlacement[this.view];
      if (placement) {
        props.push({
          id: 'pencil',
          className: 'pencil-prop',
          src: publicUrl('assets/room407/props/pencil-model.png'),
          ...placement,
        });
      }
    }

    if (this.view === 'desk' && this.drawerOpen) {
      if (!this.collected.has('tape')) {
        props.push({
          id: 'tape',
          className: 'drawer-prop',
          src: publicUrl('assets/inventory-icons/tape.png'),
          x: 42.3,
          y: 71.5,
          width: 4.6,
        });
      }
      if (!this.collected.has('oldBattery')) {
        props.push({
          id: 'oldBattery',
          className: 'drawer-prop',
          src: publicUrl('assets/inventory-icons/battery.png'),
          x: 48.3,
          y: 72.5,
          width: 1.8,
        });
      }
    }

    stateNodes.push(
      ...props.map((prop) => {
        const image = document.createElement('img');
        image.src = prop.src;
        image.alt = '';
        image.className = `room-prop ${prop.className}`;
        image.dataset.objectId = prop.id;
        image.style.left = `${prop.x}%`;
        image.style.top = `${prop.y}%`;
        image.style.width = `${prop.width}%`;
        return image;
      }),
    );
    this.stateLayer.replaceChildren(...stateNodes);
  }

  private hotspots(): Hotspot[] {
    if (this.view === 'wardrobe') {
      return [
        {
          id: 'pencil', x: 0.235, y: 0.515, width: 0.06, height: 0.09,
          visible: () => !this.collected.has('pencil'),
        },
        {
          id: 'receipt', x: 0.285, y: 0.29, width: 0.085, height: 0.28,
          visible: () => this.wardrobeOpen.has('left') && !this.collected.has('receipt'),
        },
        {
          id: 'safe', x: 0.405, y: 0.3, width: 0.11, height: 0.31,
          visible: () => this.wardrobeOpen.has('right'),
        },
        { id: 'wardrobeLeft', x: 0.297, y: 0.205, width: 0.069, height: 0.36 },
        { id: 'wardrobeMiddle', x: 0.366, y: 0.205, width: 0.064, height: 0.36 },
        { id: 'wardrobeRight', x: 0.43, y: 0.205, width: 0.064, height: 0.36 },
        { id: 'table', x: 0.02, y: 0.42, width: 0.26, height: 0.48 },
        { id: 'door', x: 0.69, y: 0.22, width: 0.09, height: 0.5 },
      ];
    }
    if (this.view === 'desk') {
      return [
        {
          id: 'pencil', x: 0.48, y: 0.55, width: 0.08, height: 0.09,
          visible: () => !this.collected.has('pencil'),
        },
        {
          id: 'tape', x: 0.4, y: 0.66, width: 0.09, height: 0.16,
          visible: () => this.drawerOpen && !this.collected.has('tape'),
        },
        {
          id: 'oldBattery', x: 0.475, y: 0.66, width: 0.06, height: 0.16,
          visible: () => this.drawerOpen && !this.collected.has('oldBattery'),
        },
        { id: 'recorder', x: 0.29, y: 0.43, width: 0.12, height: 0.18 },
        { id: 'drawer', x: 0.29, y: 0.58, width: 0.14, height: 0.21 },
        { id: 'table', x: 0.27, y: 0.49, width: 0.31, height: 0.36 },
      ];
    }
    if (this.view === 'bed') {
      return [
        { id: 'door', x: 0.25, y: 0.21, width: 0.1, height: 0.48 },
      ];
    }
    if (this.view === 'back') {
      return [
        {
          id: 'pencil', x: 0.875, y: 0.535, width: 0.075, height: 0.1,
          visible: () => !this.collected.has('pencil'),
        },
        { id: 'recorder', x: 0.705, y: 0.46, width: 0.12, height: 0.18 },
        { id: 'table', x: 0.68, y: 0.48, width: 0.3, height: 0.38 },
      ];
    }
    return [];
  }

  private findTarget(x: number, y: number): Hotspot | undefined {
    return this.hotspots()
      .filter((spot) => !spot.visible || spot.visible())
      .find(
        (spot) =>
          x >= spot.x && x <= spot.x + spot.width &&
          y >= spot.y && y <= spot.y + spot.height,
      );
  }

  private pickFocusTarget(): Hotspot | undefined {
    const spots = this.hotspots().filter((spot) => !spot.visible || spot.visible());
    const current = spots.find((spot) => spot.id === this.targetObject);
    if (current) return current;
    return spots.sort((a, b) => {
      const ax = a.x + a.width / 2 - 0.5;
      const ay = a.y + a.height / 2 - 0.5;
      const bx = b.x + b.width / 2 - 0.5;
      const by = b.y + b.height / 2 - 0.5;
      return ax * ax + ay * ay - (bx * bx + by * by);
    })[0];
  }
}
