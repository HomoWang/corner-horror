import { describe, expect, it } from 'vitest';
import {
  combineFirefighterEquipment,
  mergeFirefighterEquipmentOnCollect,
} from '../src/prototype/inventory-combination';

describe('mergeFirefighterEquipmentOnCollect', () => {
  it('automatically merges a collected mask into the clothing and helmet slot', () => {
    expect(
      mergeFirefighterEquipmentOnCollect(
        ['pendant', 'firefighterGear', null, null, null, null],
        'firefighterMask',
      ),
    ).toEqual({
      slots: ['pendant', 'completeFirefighterGear', null, null, null, null],
      item: 'completeFirefighterGear',
    });
  });

  it('automatically merges collected clothing and helmet into the mask slot', () => {
    expect(
      mergeFirefighterEquipmentOnCollect(
        ['firefighterMask', null, null, null, null, null],
        'firefighterGear',
      ),
    ).toEqual({
      slots: ['completeFirefighterGear', null, null, null, null, null],
      item: 'completeFirefighterGear',
    });
  });

  it('leaves unrelated pickups unchanged', () => {
    expect(
      mergeFirefighterEquipmentOnCollect(
        ['firefighterGear', null, null, null, null, null],
        'pendant',
      ),
    ).toBeNull();
  });
});

describe('combineFirefighterEquipment', () => {
  const slots = [
    'pendant',
    'firefighterGear',
    'firefighterMask',
    null,
    null,
    null,
  ] as const;

  it('combines the mask into the clothing and helmet slot in either selection order', () => {
    expect(combineFirefighterEquipment(slots, 'firefighterGear', 'firefighterMask')).toEqual({
      slots: ['pendant', 'completeFirefighterGear', null, null, null, null],
      item: 'completeFirefighterGear',
    });
    expect(combineFirefighterEquipment(slots, 'firefighterMask', 'firefighterGear')).toEqual({
      slots: ['pendant', 'completeFirefighterGear', null, null, null, null],
      item: 'completeFirefighterGear',
    });
  });

  it('does not combine without both items or a deliberate two-item selection', () => {
    expect(combineFirefighterEquipment(slots, null, 'firefighterMask')).toBeNull();
    expect(combineFirefighterEquipment(slots, 'pendant', 'firefighterMask')).toBeNull();
    expect(
      combineFirefighterEquipment(
        ['pendant', 'firefighterGear', null, null, null, null],
        'firefighterGear',
        'firefighterMask',
      ),
    ).toBeNull();
  });
});
