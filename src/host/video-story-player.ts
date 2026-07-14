import {
  parseVideoStoryManifest,
  resolveVideoStoryAsset,
  videoStoryChoiceSide,
  type VideoStoryAction,
  type VideoStoryChoice,
  type VideoStoryCue,
  type VideoStoryManifest,
  type VideoStoryNode,
  type VideoStoryPreload,
  type VideoStorySide,
} from '../shared/video-story';

export interface VideoStoryPlayerCallbacks {
  onNodeChange?(id: string, node: VideoStoryNode): void;
  onCue?(cue: VideoStoryCue): void;
  onAction?(action: VideoStoryAction): void;
  onChoice?(choice: VideoStoryChoice): void;
  onChoiceFocus?(side: VideoStorySide | null): void;
  onEnding?(ending: string): void;
  onIncomplete?(id: string): void;
  onError?(error: Error): void;
}

type FetchLike = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;

/**
 * Silent FMV renderer for the host screen. Two video layers are alternated so the
 * next common or branch clip can be buffered before the active clip reaches its end.
 * All dialogue, stings and haptics stay in the existing cue system.
 */
export class VideoStoryPlayer {
  private readonly videos: [HTMLVideoElement, HTMLVideoElement];
  private activeIndex = 0;
  private manifest: VideoStoryManifest | null = null;
  private manifestUrl = '';
  private currentNodeId: string | null = null;
  private nextPreloadedId: string | null = null;
  private cueIndex = 0;
  private pendingAction: VideoStoryAction | null = null;
  private actionDeadlineAt = 0;
  private pendingChoice: VideoStoryChoice | null = null;
  private choiceDeadlineAt = 0;
  private choiceFocus: VideoStorySide | null = null;
  private actionWasPressed = false;
  private completed = false;
  private destroyed = false;

  constructor(
    private readonly container: HTMLElement,
    private readonly callbacks: VideoStoryPlayerCallbacks = {},
    private readonly fetcher: FetchLike = (input, init) => fetch(input, init),
  ) {
    this.videos = [this.createVideo('front'), this.createVideo('back')];
    for (const video of this.videos) this.container.append(video);
  }

  async load(manifestUrl: string): Promise<VideoStoryManifest> {
    const response = await this.fetcher(manifestUrl, { cache: 'no-cache' });
    if (!response.ok) throw new Error(`Unable to load video story (${response.status})`);
    const manifest = parseVideoStoryManifest(await response.json());
    this.manifest = manifest;
    this.manifestUrl = response.url || manifestUrl;
    return manifest;
  }

  async start(): Promise<void> {
    if (!this.manifest) throw new Error('Load the video story manifest before starting');
    this.reset();
    await this.playNode(this.manifest.entry, false);
  }

  update(actionPressed: boolean, aimX: number | null): void {
    if (!this.manifest || !this.currentNodeId) return;
    const video = this.activeVideo;
    const node = this.manifest.nodes[this.currentNodeId];
    if (!node) return;
    while (this.cueIndex < node.cues.length) {
      const cue = node.cues[this.cueIndex];
      if (!cue || cue.at > video.currentTime + 0.035) break;
      this.cueIndex += 1;
      this.callbacks.onCue?.(cue);
    }

    const actionRisingEdge = actionPressed && !this.actionWasPressed;
    this.actionWasPressed = actionPressed;
    if (this.completed && actionRisingEdge) {
      void this.start();
      return;
    }
    if (this.pendingAction) {
      const timedOut = performance.now() >= this.actionDeadlineAt;
      if (!actionRisingEdge && !timedOut) return;
      const next = this.pendingAction.next;
      this.pendingAction = null;
      this.actionDeadlineAt = 0;
      void this.playNode(next, true);
      return;
    }
    if (!this.pendingChoice) return;
    const nextFocus = videoStoryChoiceSide(aimX);
    if (nextFocus !== this.choiceFocus) {
      this.choiceFocus = nextFocus;
      this.callbacks.onChoiceFocus?.(nextFocus);
      const focusedOption = nextFocus
        ? this.pendingChoice.options.find((candidate) => candidate.screenSide === nextFocus)
        : undefined;
      if (focusedOption) this.preload(focusedOption.next);
    }
    const timedOut = performance.now() >= this.choiceDeadlineAt;
    if (!actionRisingEdge && !timedOut) return;
    const option = this.choiceFocus
      ? this.pendingChoice.options.find((candidate) => candidate.screenSide === this.choiceFocus)
      : timedOut
        ? this.pendingChoice.options[0]
        : undefined;
    if (!option) return;
    this.pendingChoice = null;
    this.choiceDeadlineAt = 0;
    this.callbacks.onChoiceFocus?.(null);
    void this.playNode(option.next, true);
  }

  reset(): void {
    this.currentNodeId = null;
    this.nextPreloadedId = null;
    this.cueIndex = 0;
    this.pendingAction = null;
    this.actionDeadlineAt = 0;
    this.pendingChoice = null;
    this.choiceDeadlineAt = 0;
    this.choiceFocus = null;
    this.actionWasPressed = false;
    this.completed = false;
    for (const video of this.videos) {
      video.pause();
      video.removeAttribute('src');
      video.removeAttribute('poster');
      video.load();
      this.setVideoActive(video, false);
    }
    this.activeIndex = 0;
  }

  destroy(): void {
    this.destroyed = true;
    this.reset();
    for (const video of this.videos) video.remove();
  }

  private get activeVideo(): HTMLVideoElement {
    return this.activeIndex === 0 ? this.videos[0] : this.videos[1];
  }

  private get standbyVideo(): HTMLVideoElement {
    return this.videos[this.activeIndex === 0 ? 1 : 0];
  }

  private createVideo(layer: string): HTMLVideoElement {
    const video = document.createElement('video');
    video.className = 'video-story-layer standby';
    video.dataset.layer = layer;
    video.muted = true;
    video.playsInline = true;
    video.preload = 'auto';
    video.disablePictureInPicture = true;
    video.hidden = true;
    video.setAttribute('aria-hidden', 'true');
    video.addEventListener('ended', () => {
      if (video !== this.activeVideo || this.destroyed) return;
      void this.handleEnded();
    });
    video.addEventListener('error', () => {
      if (video.error) this.callbacks.onError?.(new Error(`Video playback failed (${video.error.code})`));
    });
    return video;
  }

  private async playNode(id: string, usePreloaded: boolean): Promise<void> {
    const manifest = this.manifest;
    if (!manifest) return;
    const node = manifest.nodes[id];
    if (!node) throw new Error(`Unknown video story node ${id}`);
    if (node.status !== 'ready') {
      this.callbacks.onIncomplete?.(id);
      return;
    }

    let video = this.activeVideo;
    if (usePreloaded && this.nextPreloadedId === id) {
      this.activeVideo.pause();
      this.setVideoActive(this.activeVideo, false);
      this.activeIndex = this.activeIndex === 0 ? 1 : 0;
      video = this.activeVideo;
    } else {
      this.loadVideoSource(video, node, 'auto');
    }
    video.currentTime = 0;
    this.setVideoActive(video, true);
    this.currentNodeId = id;
    this.cueIndex = 0;
    this.pendingAction = null;
    this.actionDeadlineAt = 0;
    this.pendingChoice = null;
    this.choiceDeadlineAt = 0;
    this.choiceFocus = null;
    this.completed = false;
    this.nextPreloadedId = null;
    this.callbacks.onNodeChange?.(id, node);
    this.preload(node.next ?? node.action?.next ?? null);
    try {
      await video.play();
    } catch (error) {
      this.callbacks.onError?.(error instanceof Error ? error : new Error(String(error)));
    }
  }

  private preload(id: string | null): void {
    if (!id || !this.manifest) return;
    if (this.nextPreloadedId === id) return;
    const node = this.manifest.nodes[id];
    if (!node || node.status !== 'ready') return;
    const video = this.standbyVideo;
    this.setVideoActive(video, false);
    this.loadVideoSource(video, node, this.manifest.defaults.preload);
    this.nextPreloadedId = id;
  }

  private loadVideoSource(video: HTMLVideoElement, node: VideoStoryNode, preload: VideoStoryPreload): void {
    video.src = resolveVideoStoryAsset(this.manifestUrl, node.video);
    if (node.firstFrame) {
      video.poster = resolveVideoStoryAsset(this.manifestUrl, node.firstFrame);
    } else {
      video.removeAttribute('poster');
    }
    video.preload = preload;
    const playbackRate = node.playbackRate ?? this.manifest?.defaults.playbackRate ?? 1;
    video.defaultPlaybackRate = playbackRate;
    video.playbackRate = playbackRate;
    video.load();
  }

  private setVideoActive(video: HTMLVideoElement, active: boolean): void {
    video.classList.toggle('active', active);
    video.classList.toggle('standby', !active);
    video.hidden = !active;
    video.setAttribute('aria-hidden', active ? 'false' : 'true');
  }

  private async handleEnded(): Promise<void> {
    if (!this.manifest || !this.currentNodeId) return;
    const node = this.manifest.nodes[this.currentNodeId];
    if (!node) return;
    // Catch cues very close to the final encoded frame even when timeupdate skipped it.
    while (this.cueIndex < node.cues.length) {
      const cue = node.cues[this.cueIndex];
      this.cueIndex += 1;
      if (cue) this.callbacks.onCue?.(cue);
    }
    if (node.action) {
      this.pendingAction = node.action;
      this.actionDeadlineAt = performance.now() + node.action.timeoutSeconds * 1000;
      this.preload(node.action.next);
      this.callbacks.onAction?.(node.action);
      return;
    }
    if (node.choice) {
      this.pendingChoice = node.choice;
      this.choiceDeadlineAt = performance.now() + node.choice.timeoutSeconds * 1000;
      this.preload(node.choice.options[0]?.next ?? null);
      this.callbacks.onChoice?.(node.choice);
      return;
    }
    if (node.next) {
      await this.playNode(node.next, true);
      return;
    }
    if (node.ending) {
      this.completed = true;
      this.callbacks.onEnding?.(node.ending);
    }
  }
}
