export interface SaveEnvelope<TData = Record<string, unknown>> {
  version: 1;
  updatedAt: string;
  data: TData;
}

interface DesktopPersistenceBridge {
  loadSave(): Promise<unknown>;
  writeSave(value: unknown): Promise<boolean>;
  clearSave(): Promise<boolean>;
}

declare global {
  interface Window {
    room307Desktop?: DesktopPersistenceBridge;
  }
}

const browserSaveKey = 'room307-save-v1';

function isSaveEnvelope(value: unknown): value is SaveEnvelope {
  if (typeof value !== 'object' || value === null) return false;
  const candidate = value as Partial<SaveEnvelope>;
  return (
    candidate.version === 1 &&
    typeof candidate.updatedAt === 'string' &&
    typeof candidate.data === 'object' &&
    candidate.data !== null &&
    !Array.isArray(candidate.data)
  );
}

export async function loadSave<TData extends Record<string, unknown>>() {
  let value: unknown = null;
  if (window.room307Desktop) {
    value = await window.room307Desktop.loadSave();
  } else {
    const raw = localStorage.getItem(browserSaveKey);
    if (raw) {
      try {
        value = JSON.parse(raw);
      } catch {
        value = null;
      }
    }
  }
  return isSaveEnvelope(value) ? (value as SaveEnvelope<TData>) : null;
}

export async function writeSave<TData extends Record<string, unknown>>(data: TData) {
  const envelope: SaveEnvelope<TData> = {
    version: 1,
    updatedAt: new Date().toISOString(),
    data,
  };
  if (window.room307Desktop) {
    await window.room307Desktop.writeSave(envelope);
  } else {
    localStorage.setItem(browserSaveKey, JSON.stringify(envelope));
  }
  return envelope;
}

export async function clearSave() {
  if (window.room307Desktop) {
    await window.room307Desktop.clearSave();
  } else {
    localStorage.removeItem(browserSaveKey);
  }
}
