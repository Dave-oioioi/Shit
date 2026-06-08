const memoryStore = new Map<string, string>();

function getStorage(): Storage | null {
  if (typeof window === "undefined") {
    return null;
  }

  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

export function readStorage<T>(key: string, fallback: T): T {
  const storage = getStorage();
  const value = storage?.getItem(key) ?? memoryStore.get(key);

  if (!value) {
    return fallback;
  }

  try {
    return JSON.parse(value) as T;
  } catch {
    return fallback;
  }
}

export function writeStorage<T>(key: string, value: T) {
  const serialized = JSON.stringify(value);
  const storage = getStorage();

  if (storage) {
    storage.setItem(key, serialized);
    return;
  }

  memoryStore.set(key, serialized);
}
