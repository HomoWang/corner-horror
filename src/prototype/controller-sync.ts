export interface ControllerSyncSignal {
  type: string;
  controller?: boolean;
}

export function shouldRefreshControllerState(signal: ControllerSyncSignal): boolean {
  return signal.type === 'ready' || (signal.type === 'status' && signal.controller === true);
}
