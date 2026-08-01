import "@testing-library/jest-dom/vitest";

// Set minimal env vars needed for modules to load
process.env.NEXTAUTH_SECRET = "test-secret";
process.env.INTERNAL_API_SECRET = "test-secret";
process.env.SERVER_API_URL = "http://localhost:3001";

global.ResizeObserver = class ResizeObserver {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars -- ResizeObserver constructor requires callback parameter
  constructor(callback?: ResizeObserverCallback) {}
  observe() {}
  unobserve() {}
  disconnect() {}
};
