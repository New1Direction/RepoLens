// tests/dom-environment.js
// Custom Vitest environment that installs the minimal DOM from dom-shim.js onto
// the global scope. Used in place of jsdom because the repo intentionally ships
// no DOM dependency (and `npm install` is unavailable). Reference it from a test
// via the annotation:  // @vitest-environment ./tests/dom-environment
//
// Shape per Vitest's non-VM environment contract: default export with
// { name, transformMode, setup(global, options) -> { teardown } }.
// Vitest invokes setup(globalThis, options).

import { createDocument } from './dom-shim.js';

export default {
  name: 'repolens-dom',
  transformMode: 'web',
  setup(global) {
    const target = global || globalThis;
    const document = createDocument();

    const prevDocument = target.document;
    const prevWindow = target.window;

    target.document = document;
    if (!target.window) target.window = target;
    if (target.window && !target.window.document) target.window.document = document;

    // Belt-and-suspenders: some pools resolve bare `document` against globalThis
    // rather than the passed reference.
    globalThis.document = document;
    if (!globalThis.window) globalThis.window = globalThis;

    return {
      teardown() {
        target.document = prevDocument;
        target.window = prevWindow;
      },
    };
  },
};
