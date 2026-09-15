import { describe, expect, it } from 'vitest';
import { GAME_CANON } from '../src/shared/game-canon';

describe('307 canonical story', () => {
  it('locks the protagonist, reality, and first chapter', () => {
    expect(GAME_CANON.title).toBe('307');
    expect(GAME_CANON.firstChapter).toBe('開端');
    expect(GAME_CANON.protagonist.occupation).toBe('消防員');
    expect(GAME_CANON.reality.girlfriendSurvived).toBe(true);
    expect(GAME_CANON.reality.protagonistIsDead).toBe(false);
  });

  it('keeps the two ending meanings unambiguous', () => {
    expect(GAME_CANON.endings.openDoor).toContain('醫院醒來');
    expect(GAME_CANON.endings.openDoor).toContain('女友');
    expect(GAME_CANON.endings.closeDoor).toContain('持續長音');
  });
});
