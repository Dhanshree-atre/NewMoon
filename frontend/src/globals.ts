import { Buffer } from 'buffer';

// Third-party libraries (Apollo Client, etc.) expect `process.env.NODE_ENV`.
// @ts-expect-error - minimal process polyfill for the browser.
globalThis.process = {
  env: {
    NODE_ENV: import.meta.env.MODE,
  },
};

// Midnight.js relies on Buffer in the browser.
globalThis.Buffer = Buffer;
