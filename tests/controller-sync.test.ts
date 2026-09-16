import { describe, expect, it } from 'vitest';
import { shouldRefreshControllerState } from '../src/prototype/controller-sync';

describe('controller state refresh', () => {
  it('refreshes state for a newly ready controller', () => {
    expect(shouldRefreshControllerState({ type: 'ready' })).toBe(true);
  });

  it('refreshes state when an existing controller reconnects to a restarted host', () => {
    expect(shouldRefreshControllerState({ type: 'status', controller: true })).toBe(true);
  });

  it('does not refresh state when no controller is connected', () => {
    expect(shouldRefreshControllerState({ type: 'status', controller: false })).toBe(false);
  });
});
