import type { ProtoItemId } from '../shared/protocol';

export interface PendantBatteryInstallation {
  slots: Array<ProtoItemId | null>;
  selectedItem: 'pendant';
}

export function installPendantBattery(
  slots: ReadonlyArray<ProtoItemId | null>,
  selectedItem: ProtoItemId | null,
  activatedItem: ProtoItemId,
  alreadyPowered: boolean,
): PendantBatteryInstallation | null {
  if (alreadyPowered || !slots.includes('pendant')) return null;

  const isBatteryAction = activatedItem === 'oldBattery';
  const isSelectedBatteryAppliedToPendant =
    selectedItem === 'oldBattery' && activatedItem === 'pendant';
  if (!isBatteryAction && !isSelectedBatteryAppliedToPendant) return null;

  const batteryIndex = slots.indexOf('oldBattery');
  if (batteryIndex === -1) return null;

  const updatedSlots = [...slots];
  updatedSlots[batteryIndex] = null;
  return { slots: updatedSlots, selectedItem: 'pendant' };
}
