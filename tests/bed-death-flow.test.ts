import { describe, expect, it } from 'vitest';
import { BED_BLOOD_HOLD_MS, buildBedDeathRestartUrl } from '../src/prototype/bed-death-flow';

describe('bed death menu flow', () => {
  it('holds the blood-filled ending before showing the menu', () => {
    expect(BED_BLOOD_HOLD_MS).toBe(2400);
  });

  it('restarts with the same room code and no inspection shortcut', () => {
    const url = new URL(
      buildBedDeathRestartUrl(
        'http://127.0.0.1:5174/prototype.html?desktop=1&inspect=bed',
        'ABCD1234',
      ),
    );

    expect(url.searchParams.get('room')).toBe('ABCD1234');
    expect(url.searchParams.get('restart')).toBe('death');
    expect(url.searchParams.has('inspect')).toBe(false);
  });
});
