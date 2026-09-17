import { publicUrl } from '../shared/public-url';

export type RoomObjectId =
  | 'wardrobe'
  | 'wardrobeLeft'
  | 'wardrobeMiddle'
  | 'wardrobeRight'
  | 'receipt'
  | 'table'
  | 'photo'
  | 'familyPhoto'
  | 'firefighterPhoto'
  | 'girlfriendPhoto'
  | 'couplePhotoFrame'
  | 'firefighterAward'
  | 'safe'
  | 'cardboardBox'
  | 'firefighterMask'
  | 'deskDrawer'
  | 'tape'
  | 'antenna'
  | 'bed'
  | 'recorder'
  | 'door';

export type WardrobeSection = 'left' | 'middle' | 'right';
export type ViewId = 'wardrobe' | 'desk' | 'back' | 'bed';
type NavigationDirection = 'left' | 'right' | 'forward' | 'back';

export interface PrototypeRoomState {
  view: ViewId;
  wardrobeOpen: WardrobeSection[];
  safeOpen: boolean;
  tapeInserted: boolean;
  couplePhotoMounted: boolean;
  collected: RoomObjectId[];
}

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
  wardrobe: publicUrl('assets/room307/photos/衣櫥.png'),
  desk: publicUrl('assets/room307/photos/desk-wall-clean-v3.png'),
  back: publicUrl('assets/room307/photos/back-wall-no-photos-v3.png'),
  bed: publicUrl('assets/room307/photos/bed-door-wall.png'),
};

const STORY_WALL_IMAGES = {
  family: publicUrl('assets/room307/photos/男主童年家庭照.png'),
  firefighter: publicUrl('assets/room307/photos/消防員走向火場.png'),
  girlfriend: publicUrl('assets/room307/photos/女友搬家生活照.png'),
  couple: publicUrl('assets/room307/photos/男女主角照片.png'),
  awards: publicUrl('assets/room307/photos/祈彥殉職褒揚狀-v1.png'),
} as const;

const WARDROBE_IMAGES = {
  closed: publicUrl('assets/room307/photos/wardrobe-base-no-photos.png'),
  leftOpen: publicUrl('assets/room307/photos/wardrobe-left-consistent.png'),
  rightOpen: publicUrl('assets/room307/photos/wardrobe-right-repaired.png'),
  bothOpen: publicUrl('assets/room307/photos/wardrobe-both-repaired.png'),
} as const;

const PROP_IMAGES = {
  receipt: publicUrl('assets/room307/props/receipt-door.png'),
  firefighterMask: publicUrl('assets/room307/props/firefighter-mask-hanging-v2.png'),
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
  private tapeInserted = false;
  private couplePhotoMounted = false;
  private collected = new Set<RoomObjectId>();

  constructor(private readonly root: HTMLElement) {
    new Set([
      ...Object.values(VIEW_IMAGES),
      ...Object.values(WARDROBE_IMAGES),
      ...Object.values(STORY_WALL_IMAGES),
      ...Object.values(PROP_IMAGES),
    ]).forEach((src) => {
      const preload = new Image();
      preload.src = src;
    });

    this.image = document.createElement('img');
    this.image.id = 'room-background';
    this.image.alt = '307 房間';
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
    const roomRect = this.root.getBoundingClientRect();
    const layerRect = this.stateLayer.getBoundingClientRect();
    const clientX = roomRect.left + aimX * roomRect.width;
    const clientY = roomRect.top + aimY * roomRect.height;
    const localX = (clientX - layerRect.left) / layerRect.width;
    const localY = (clientY - layerRect.top) / layerRect.height;
    this.targetObject = this.findTarget(localX, localY)?.id ?? null;

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

  hasTapeInRecorder(): boolean {
    return this.tapeInserted;
  }

  insertTapeIntoRecorder(): boolean {
    if (this.tapeInserted) return false;
    this.tapeInserted = true;
    this.renderState();
    return true;
  }

  mountCouplePhoto(): boolean {
    if (this.couplePhotoMounted) return false;
    this.couplePhotoMounted = true;
    this.view = 'back';
    this.renderView(false);
    return true;
  }

  hasMountedCouplePhoto(): boolean {
    return this.couplePhotoMounted;
  }

  getPersistenceState(): PrototypeRoomState {
    return {
      view: this.view,
      wardrobeOpen: [...this.wardrobeOpen],
      safeOpen: this.safeOpen,
      tapeInserted: this.tapeInserted,
      couplePhotoMounted: this.couplePhotoMounted,
      collected: [...this.collected],
    };
  }

  restorePersistenceState(state: PrototypeRoomState): void {
    this.view = state.view;
    this.wardrobeOpen = new Set(state.wardrobeOpen);
    this.safeOpen = state.safeOpen;
    this.tapeInserted = state.tapeInserted;
    this.couplePhotoMounted = state.couplePhotoMounted;
    this.collected = new Set(state.collected);
    this.focused = false;
    this.focusedTarget = null;
    this.dragOffset = { x: 0, y: 0 };
    this.targetObject = null;
    this.transitionSeconds = 0;
    this.root.classList.remove('focused', 'dragging', 'switching-wall');
    this.renderView(false);
  }

  collectObject(objectId: RoomObjectId): void {
    this.collected.add(objectId);
    if (objectId === 'photo') this.renderState();
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

  private renderView(animate = true): void {
    const source = this.currentViewImage();
    this.image.src = source;
    this.root.style.backgroundImage = `url("${source}")`;
    this.root.dataset.view = this.view;
    this.root.setAttribute('aria-label', `307 房間：${VIEW_LABELS[this.view]}`);
    this.root.classList.toggle('changing-view', animate);
    if (animate) window.setTimeout(() => this.root.classList.remove('changing-view'), 260);
    this.renderState();
  }

  private currentViewImage(): string {
    if (this.view !== 'wardrobe') return VIEW_IMAGES[this.view];
    return WARDROBE_IMAGES.closed;
  }

  private currentWardrobeOverlay(): string | null {
    const leftOpen = this.wardrobeOpen.has('left') || this.wardrobeOpen.has('middle');
    const rightOpen = this.wardrobeOpen.has('right');
    if (leftOpen && rightOpen) return WARDROBE_IMAGES.bothOpen;
    if (rightOpen) return WARDROBE_IMAGES.rightOpen;
    if (leftOpen) return WARDROBE_IMAGES.leftOpen;
    return null;
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

    if (this.view === 'wardrobe') {
      const wardrobeOverlay = this.currentWardrobeOverlay();
      if (wardrobeOverlay) {
        const image = document.createElement('img');
        image.src = wardrobeOverlay;
        image.alt = '';
        image.className = 'wardrobe-state-overlay';
        stateNodes.push(image);
      }
      const maskHook = document.createElement('span');
      maskHook.className = 'firefighter-mask-hook';
      maskHook.setAttribute('aria-hidden', 'true');
      stateNodes.push(maskHook);
      if (!this.collected.has('firefighterMask')) {
        props.push({
          id: 'firefighterMask',
          className: 'firefighter-mask-prop',
          src: PROP_IMAGES.firefighterMask,
          x: 57.65,
          y: 30.75,
          width: 3.55,
        });
      }
    }

    if (this.view === 'back') {
      const award = document.createElement('div');
      award.className = 'story-wall-award award-one';
      award.dataset.objectId = 'firefighterAward';
      award.style.backgroundImage = `url("${STORY_WALL_IMAGES.awards}")`;
      stateNodes.push(award);

      const wallPhotos = [
        { id: 'familyPhoto', className: 'family-photo', src: STORY_WALL_IMAGES.family },
        { id: 'firefighterPhoto', className: 'firefighter-photo', src: STORY_WALL_IMAGES.firefighter },
        { id: 'girlfriendPhoto', className: 'girlfriend-photo', src: STORY_WALL_IMAGES.girlfriend },
      ];
      stateNodes.push(
        ...wallPhotos.map(({ id, className, src }) => {
          const frame = document.createElement('figure');
          frame.className = `story-wall-photo ${className}`;
          frame.dataset.objectId = id;
          const image = document.createElement('img');
          image.src = src;
          image.alt = '';
          frame.append(image);
          return frame;
        }),
      );

      const coupleFrame = document.createElement('figure');
      coupleFrame.className = `story-wall-photo couple-photo ${
        this.couplePhotoMounted ? 'mounted' : 'empty'
      }`;
      coupleFrame.dataset.objectId = 'couplePhotoFrame';
      if (this.couplePhotoMounted) {
        const image = document.createElement('img');
        image.src = STORY_WALL_IMAGES.couple;
        image.alt = '';
        coupleFrame.append(image);
      }
      stateNodes.push(coupleFrame);
    }

    if (
      this.view === 'wardrobe' &&
      (this.wardrobeOpen.has('left') || this.wardrobeOpen.has('middle')) &&
      !this.collected.has('receipt')
    ) {
      props.push({
        id: 'receipt',
        className: 'receipt-prop',
        src: PROP_IMAGES.receipt,
        x: 30.45,
        y: 35.25,
        width: 2.7,
      });
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
          id: 'receipt', x: 0.291, y: 0.283, width: 0.027, height: 0.138,
          visible: () =>
            (this.wardrobeOpen.has('left') || this.wardrobeOpen.has('middle')) &&
            !this.collected.has('receipt'),
        },
        { id: 'cardboardBox', x: 0.48, y: 0.535, width: 0.075, height: 0.105 },
        {
          id: 'firefighterMask', x: 0.555, y: 0.285, width: 0.06, height: 0.16,
          visible: () => !this.collected.has('firefighterMask'),
        },
        {
          id: 'safe', x: 0.419, y: 0.41, width: 0.055, height: 0.18,
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
        { id: 'recorder', x: 0.29, y: 0.43, width: 0.12, height: 0.18 },
        { id: 'deskDrawer', x: 0.415, y: 0.555, width: 0.18, height: 0.16 },
        { id: 'table', x: 0.27, y: 0.49, width: 0.31, height: 0.36 },
      ];
    }
    if (this.view === 'bed') {
      return [
        { id: 'bed', x: 0.4, y: 0.5, width: 0.55, height: 0.38 },
        { id: 'door', x: 0.25, y: 0.21, width: 0.1, height: 0.48 },
      ];
    }
    if (this.view === 'back') {
      return [
        { id: 'familyPhoto', x: 0.363, y: 0.29, width: 0.035, height: 0.05 },
        { id: 'firefighterAward', x: 0.431, y: 0.273, width: 0.028, height: 0.084 },
        { id: 'firefighterPhoto', x: 0.494, y: 0.288, width: 0.032, height: 0.055 },
        { id: 'couplePhotoFrame', x: 0.558, y: 0.29, width: 0.035, height: 0.05 },
        { id: 'girlfriendPhoto', x: 0.463, y: 0.415, width: 0.035, height: 0.05 },
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
