class StorageMock {
  private store: Record<string, string> = {};

  getItem(key: string) {
    return this.store[key] ?? null;
  }

  setItem(key: string, value: string) {
    this.store[key] = value.toString();
  }

  clear() {
    this.store = {};
  }

  removeItem(key: string) {
    delete this.store[key];
  }
}

Object.defineProperties(globalThis, {
  Storage: { value: StorageMock },
  localStorage: { value: new StorageMock() }
});
