import '@testing-library/jest-dom/vitest';
import { afterAll, afterEach, beforeAll } from 'vitest';
import { cleanup } from '@testing-library/react';
import { server } from './mocks/server';

// Suppress spurious act() warnings from React 18 + userEvent interactions
// This is a known issue: https://github.com/testing-library/react-testing-library/issues/1051
const originalError = console.error;
beforeAll(() => {
  console.error = (...args: unknown[]) => {
    const message = typeof args[0] === 'string' ? args[0] : '';
    if (message.includes('not wrapped in act')) {
      return;
    }
    originalError.call(console, ...args);
  };
});

// Establish API mocking before all tests
beforeAll(() => {
  server.listen({ onUnhandledRequest: 'error' });
});

// Reset any request handlers that we may add during the tests,
// so they don't affect other tests
afterEach(() => {
  cleanup();
  server.resetHandlers();
});

// Clean up after the tests are finished
afterAll(() => {
  console.error = originalError;
  server.close();
});
