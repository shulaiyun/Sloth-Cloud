import '@testing-library/jest-dom/vitest';
import { cleanup } from '@testing-library/react';
import { afterEach, vi } from 'vitest';

function createStorageMock() {
  const store = new Map<string, string>();
  return {
    getItem(key: string) {
      return store.has(key) ? store.get(key)! : null;
    },
    setItem(key: string, value: string) {
      store.set(key, String(value));
    },
    removeItem(key: string) {
      store.delete(key);
    },
    clear() {
      store.clear();
    },
    key(index: number) {
      return [...store.keys()][index] ?? null;
    },
    get length() {
      return store.size;
    },
  };
}

if (typeof HTMLElement !== 'undefined' && !HTMLElement.prototype.scrollIntoView) {
  Object.defineProperty(HTMLElement.prototype, 'scrollIntoView', {
    configurable: true,
    value: vi.fn(),
    writable: true,
  });
}

if (typeof window !== 'undefined') {
  const localStorage = createStorageMock();
  const sessionStorage = createStorageMock();

  Object.defineProperty(window, 'localStorage', {
    configurable: true,
    value: localStorage,
  });
  Object.defineProperty(window, 'sessionStorage', {
    configurable: true,
    value: sessionStorage,
  });
}

afterEach(() => {
  cleanup();
});
