import { describe, expect, it } from 'vitest';
import {
  SAFE_CODE,
  SAFE_WORN_DIGITS,
  canUnlockRoomDoor,
  receiptCodeClues,
  tapeRecordingLines,
} from '../src/prototype/chapter-one';

describe('chapter one room progression', () => {
  const complete = {
    safeUnlocked: true,
    photoMounted: true,
    tapePlayed: true,
    pendantActivated: true,
    radioBroadcastHeard: true,
  };

  it('keeps the door locked while any required memory is missing', () => {
    for (const key of Object.keys(complete) as Array<keyof typeof complete>) {
      expect(canUnlockRoomDoor({ ...complete, [key]: false })).toBe(false);
    }
  });

  it('unlocks the door after all five room events are complete', () => {
    expect(canUnlockRoomDoor(complete)).toBe(true);
  });

  it('makes the receipt clues uniquely order the four worn keypad digits', () => {
    const score = (guess: string, code: string): [number, number] => {
      const exact = [...guess].filter((digit, index) => digit === code[index]).length;
      const shared = [...guess].filter((digit) => code.includes(digit)).length;
      return [exact, shared - exact];
    };
    const permutations = (digits: readonly string[]): string[] =>
      digits.length === 1
        ? [digits[0] ?? '']
        : digits.flatMap((digit, index) =>
            permutations(digits.filter((_, otherIndex) => otherIndex !== index)).map(
              (suffix) => digit + suffix,
            ),
          );

    const matches = permutations(SAFE_WORN_DIGITS).filter((code) =>
      receiptCodeClues.every(({ guess, exact, misplaced }) => {
        const result = score(guess, code);
        return result[0] === exact && result[1] === misplaced;
      }),
    );

    expect(matches).toEqual([SAFE_CODE]);
  });

  it('ends the tape with the protagonist rejecting the altered recording', () => {
    expect(tapeRecordingLines.at(-1)?.source).toBe('祈望');
    expect(tapeRecordingLines.at(-1)?.text).toContain('後面不是這句');
  });

  it('uses plain speaker labels without production annotations', () => {
    expect(tapeRecordingLines[0]?.source).toBe('女聲');
    expect(tapeRecordingLines[2]?.source).toBe('男聲');
    expect(tapeRecordingLines.every((line) => !/[()（）]/.test(line.source))).toBe(true);
  });
});
