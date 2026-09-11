import "@testing-library/jest-dom/vitest";

// jsdom implements neither -- both are exercised by real app code
// (useTheme.js, data/useWordData.js) on mount, so every test that renders
// App (directly or via a component tree) needs them stubbed or mounting
// throws before any assertion runs.

if (!window.matchMedia) {
  window.matchMedia = (query) => ({
    matches: false,
    media: query,
    onchange: null,
    addEventListener: () => {},
    removeEventListener: () => {},
    addListener: () => {},
    removeListener: () => {},
    dispatchEvent: () => false,
  });
}

if (!globalThis.ResizeObserver) {
  globalThis.ResizeObserver = class MockResizeObserver {
    observe() {}
    unobserve() {}
    disconnect() {}
  };
}

// Fails immediately rather than trying to actually fetch/decompress the
// dataset -- useWordData's worker error handler already falls back to the
// tiny in-repo fixture (src/data/japaneseData.js) on this exact path, so
// tests get real, deterministic word data without a network or a real
// worker thread.
if (!globalThis.Worker) {
  globalThis.Worker = class MockWorker {
    constructor() {
      this._listeners = {};
    }
    addEventListener(type, handler) {
      this._listeners[type] = handler;
    }
    postMessage() {
      queueMicrotask(() => this._listeners.error?.({ message: "Worker unavailable in test environment" }));
    }
    terminate() {}
  };
}
