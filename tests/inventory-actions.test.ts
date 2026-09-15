import { describe, expect, it } from 'vitest';
import { installPendantBattery } from '../src/prototype/inventory-actions';

const inventory = ['pendant', 'oldBattery', null, null, null, null] as const;

describe('installPendantBattery', () => {
  it('removes the battery when the player uses it', () => {
    expect(installPendantBattery(inventory, null, 'oldBattery', false)).toEqual({
      slots: ['pendant', null, null, null, null, null],
      selectedItem: 'pendant',
    });
  });

  it('supports selecting the battery before applying it to the pendant', () => {
    expect(installPendantBattery(inventory, 'oldBattery', 'pendant', false)).toEqual({
      slots: ['pendant', null, null, null, null, null],
      selectedItem: 'pendant',
    });
  });

  it('cannot install twice or without both required items', () => {
    expect(installPendantBattery(inventory, null, 'oldBattery', true)).toBeNull();
    expect(
      installPendantBattery(['pendant', null, null, null, null, null], null, 'oldBattery', false),
    ).toBeNull();
    expect(
      installPendantBattery(['oldBattery', null, null, null, null, null], null, 'oldBattery', false),
    ).toBeNull();
  });
});
