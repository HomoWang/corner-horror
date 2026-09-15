import type { ProtoItemId } from '../shared/protocol';

export interface InventoryCombination {
  slots: Array<ProtoItemId | null>;
  item: 'completeFirefighterGear';
}

export function mergeFirefighterEquipmentOnCollect(
  slots: ReadonlyArray<ProtoItemId | null>,
  collectedItem: ProtoItemId,
): InventoryCombination | null {
  const counterpart = collectedItem === 'firefighterMask'
    ? 'firefighterGear'
    : collectedItem === 'firefighterGear'
      ? 'firefighterMask'
      : null;
  if (!counterpart) return null;

  const counterpartIndex = slots.indexOf(counterpart);
  if (counterpartIndex === -1) return null;

  const combinedSlots = [...slots];
  combinedSlots[counterpartIndex] = 'completeFirefighterGear';
  return { slots: combinedSlots, item: 'completeFirefighterGear' };
}

export function combineFirefighterEquipment(
  slots: ReadonlyArray<ProtoItemId | null>,
  selectedItem: ProtoItemId | null,
  activatedItem: ProtoItemId,
): InventoryCombination | null {
  const selectedPair =
    (selectedItem === 'firefighterGear' && activatedItem === 'firefighterMask') ||
    (selectedItem === 'firefighterMask' && activatedItem === 'firefighterGear');
  if (!selectedPair) return null;

  const gearIndex = slots.indexOf('firefighterGear');
  const maskIndex = slots.indexOf('firefighterMask');
  if (gearIndex === -1 || maskIndex === -1) return null;

  const combinedSlots = [...slots];
  combinedSlots[gearIndex] = 'completeFirefighterGear';
  combinedSlots[maskIndex] = null;
  return { slots: combinedSlots, item: 'completeFirefighterGear' };
}
