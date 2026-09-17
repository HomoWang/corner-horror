import { describe, expect, it } from 'vitest';
import { pendantDescription, pendantSelectionNotice } from '../src/prototype/item-copy';

describe('state-aware item copy', () => {
  it('never describes the pendant battery slot as empty after installation', () => {
    expect(pendantDescription(false, false)).toContain('電池槽目前是空的');
    expect(pendantDescription(true, false)).toBe(
      '已裝入舊電池。握住吊飾時，按住手機中央互動鍵。',
    );
    expect(pendantDescription(true, true)).toBe(
      '電池仍有微弱電力。握緊後，吊飾播放了熟悉的旋律。',
    );
  });

  it('only instructs the player to hold a powered pendant', () => {
    expect(pendantSelectionNotice(false, false)).toContain('需要裝入一顆電池');
    expect(pendantSelectionNotice(true, false)).toContain('按住手機中央互動鍵');
    expect(pendantSelectionNotice(true, true)).toBe('使用中：錄音吊飾。');
  });
});
