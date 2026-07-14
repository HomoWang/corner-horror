export type VideoStoryStatus = 'ready' | 'awaiting-generation';
export type VideoStorySide = 'left' | 'right';
export type VideoStoryPreload = '' | 'none' | 'metadata' | 'auto';

export interface VideoStoryCue {
  at: number;
  audio?: string;
  caption?: string;
  narration?: string;
  haptic?: string;
}

export interface VideoStoryAction {
  timeoutSeconds: number;
  input: 'central-button';
  prompt: string;
  next: string;
}

export interface VideoStoryChoiceOption {
  id: string;
  screenSide: VideoStorySide;
  label: string;
  next: string;
}

export interface VideoStoryChoice {
  timeoutSeconds: number;
  input: 'aim-and-central-button';
  options: VideoStoryChoiceOption[];
}

export interface VideoStoryNode {
  status?: VideoStoryStatus;
  firstFrame?: string;
  video: string;
  durationHintSeconds: number;
  playbackRate?: number;
  next?: string;
  action?: VideoStoryAction;
  choice?: VideoStoryChoice;
  ending?: string;
  cues: VideoStoryCue[];
}

export interface VideoStoryManifest {
  version: number;
  status: string;
  defaults: {
    aspectRatio: string;
    fps: number;
    preload: VideoStoryPreload;
    playbackRate: number;
  };
  entry: string;
  nodes: Record<string, VideoStoryNode>;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function requireString(value: unknown, path: string): string {
  if (typeof value !== 'string' || value.trim() === '') throw new Error(`${path} must be a non-empty string`);
  return value;
}

function requirePositiveNumber(value: unknown, path: string): number {
  if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0) {
    throw new Error(`${path} must be a positive number`);
  }
  return value;
}

function parseCue(value: unknown, path: string, duration: number): VideoStoryCue {
  if (!isRecord(value)) throw new Error(`${path} must be an object`);
  const at = typeof value.at === 'number' && Number.isFinite(value.at) ? value.at : Number.NaN;
  if (at < 0 || at > duration) throw new Error(`${path}.at must be within the node duration`);
  const cue: VideoStoryCue = { at };
  if (value.audio !== undefined) cue.audio = requireString(value.audio, `${path}.audio`);
  if (value.caption !== undefined) cue.caption = requireString(value.caption, `${path}.caption`);
  if (value.narration !== undefined) cue.narration = requireString(value.narration, `${path}.narration`);
  if (value.haptic !== undefined) cue.haptic = requireString(value.haptic, `${path}.haptic`);
  if (!cue.audio && !cue.caption && !cue.narration && !cue.haptic) throw new Error(`${path} has no effect`);
  return cue;
}

function parseAction(value: unknown, path: string): VideoStoryAction {
  if (!isRecord(value)) throw new Error(`${path} must be an object`);
  if (value.input !== 'central-button') throw new Error(`${path}.input must be central-button`);
  return {
    timeoutSeconds: requirePositiveNumber(value.timeoutSeconds, `${path}.timeoutSeconds`),
    input: 'central-button',
    prompt: requireString(value.prompt, `${path}.prompt`),
    next: requireString(value.next, `${path}.next`),
  };
}

function parseChoice(value: unknown, path: string): VideoStoryChoice {
  if (!isRecord(value)) throw new Error(`${path} must be an object`);
  const timeoutSeconds = requirePositiveNumber(value.timeoutSeconds, `${path}.timeoutSeconds`);
  if (value.input !== 'aim-and-central-button') {
    throw new Error(`${path}.input must be aim-and-central-button`);
  }
  if (!Array.isArray(value.options) || value.options.length < 2) {
    throw new Error(`${path}.options must contain at least two options`);
  }
  const ids = new Set<string>();
  const sides = new Set<VideoStorySide>();
  const options = value.options.map((rawOption, index): VideoStoryChoiceOption => {
    const optionPath = `${path}.options[${index}]`;
    if (!isRecord(rawOption)) throw new Error(`${optionPath} must be an object`);
    const id = requireString(rawOption.id, `${optionPath}.id`);
    if (ids.has(id)) throw new Error(`${path} contains duplicate option id ${id}`);
    ids.add(id);
    if (rawOption.screenSide !== 'left' && rawOption.screenSide !== 'right') {
      throw new Error(`${optionPath}.screenSide must be left or right`);
    }
    sides.add(rawOption.screenSide);
    return {
      id,
      screenSide: rawOption.screenSide,
      label: requireString(rawOption.label, `${optionPath}.label`),
      next: requireString(rawOption.next, `${optionPath}.next`),
    };
  });
  if (!sides.has('left') || !sides.has('right')) {
    throw new Error(`${path} must provide both a left and right option`);
  }
  return { timeoutSeconds, input: 'aim-and-central-button', options };
}

export function parseVideoStoryManifest(value: unknown): VideoStoryManifest {
  if (!isRecord(value)) throw new Error('video story manifest must be an object');
  if (!isRecord(value.defaults)) throw new Error('defaults must be an object');
  if (!isRecord(value.nodes) || Object.keys(value.nodes).length === 0) {
    throw new Error('nodes must be a non-empty object');
  }

  const nodes: Record<string, VideoStoryNode> = {};
  for (const [id, rawNode] of Object.entries(value.nodes)) {
    const path = `nodes.${id}`;
    if (!isRecord(rawNode)) throw new Error(`${path} must be an object`);
    const durationHintSeconds = requirePositiveNumber(
      rawNode.durationHintSeconds,
      `${path}.durationHintSeconds`,
    );
    const status = rawNode.status;
    if (status !== undefined && status !== 'ready' && status !== 'awaiting-generation') {
      throw new Error(`${path}.status is invalid`);
    }
    const node: VideoStoryNode = {
      video: requireString(rawNode.video, `${path}.video`),
      durationHintSeconds,
      cues: Array.isArray(rawNode.cues)
        ? rawNode.cues.map((cue, index) => parseCue(cue, `${path}.cues[${index}]`, durationHintSeconds))
        : [],
    };
    if (status !== undefined) node.status = status;
    if (rawNode.firstFrame !== undefined) {
      node.firstFrame = requireString(rawNode.firstFrame, `${path}.firstFrame`);
    }
    if (rawNode.playbackRate !== undefined) {
      node.playbackRate = requirePositiveNumber(rawNode.playbackRate, `${path}.playbackRate`);
    }
    if (rawNode.next !== undefined) node.next = requireString(rawNode.next, `${path}.next`);
    if (rawNode.action !== undefined) node.action = parseAction(rawNode.action, `${path}.action`);
    if (rawNode.choice !== undefined) node.choice = parseChoice(rawNode.choice, `${path}.choice`);
    if (rawNode.ending !== undefined) node.ending = requireString(rawNode.ending, `${path}.ending`);
    if ([node.next, node.action, node.choice, node.ending].filter(Boolean).length > 1) {
      throw new Error(`${path} may define only one of next, action, choice, or ending`);
    }
    nodes[id] = node;
  }

  const entry = requireString(value.entry, 'entry');
  if (!nodes[entry]) throw new Error(`entry references missing node ${entry}`);
  for (const [id, node] of Object.entries(nodes)) {
    if (node.next && !nodes[node.next]) throw new Error(`nodes.${id}.next references missing node ${node.next}`);
    if (node.action && !nodes[node.action.next]) {
      throw new Error(`nodes.${id}.action.next references missing node ${node.action.next}`);
    }
    for (const option of node.choice?.options ?? []) {
      if (!nodes[option.next]) {
        throw new Error(`nodes.${id} option ${option.id} references missing node ${option.next}`);
      }
    }
  }

  const preload = value.defaults.preload;
  if (preload !== '' && preload !== 'none' && preload !== 'metadata' && preload !== 'auto') {
    throw new Error('defaults.preload is invalid');
  }
  const playbackRate = value.defaults.playbackRate === undefined
    ? 1
    : requirePositiveNumber(value.defaults.playbackRate, 'defaults.playbackRate');

  return {
    version: requirePositiveNumber(value.version, 'version'),
    status: requireString(value.status, 'status'),
    defaults: {
      aspectRatio: requireString(value.defaults.aspectRatio, 'defaults.aspectRatio'),
      fps: requirePositiveNumber(value.defaults.fps, 'defaults.fps'),
      preload,
      playbackRate,
    },
    entry,
    nodes,
  };
}

export function videoStoryChoiceSide(aimX: number | null, deadZone = 0.18): VideoStorySide | null {
  if (aimX === null || !Number.isFinite(aimX) || Math.abs(aimX) < deadZone) return null;
  return aimX < 0 ? 'left' : 'right';
}

export function resolveVideoStoryAsset(manifestUrl: string, asset: string): string {
  return new URL(asset, new URL(manifestUrl, window.location.href)).toString();
}
