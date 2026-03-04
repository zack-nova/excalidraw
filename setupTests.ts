import fs from "fs";
import path from "path";
import { pathToFileURL } from "url";

// vitest.setup.ts
import "vitest-canvas-mock";
import "@testing-library/jest-dom";
import { vi } from "vitest";

import polyfill from "./packages/excalidraw/polyfill";
import { yellow } from "./packages/excalidraw/tests/helpers/colorize";
import { testPolyfills } from "./packages/excalidraw/tests/helpers/polyfills";

// mock for pep.js not working with setPointerCapture()
HTMLElement.prototype.setPointerCapture = vi.fn();

Object.assign(globalThis, testPolyfills);

require("fake-indexeddb/auto");

polyfill();

Object.defineProperty(window, "matchMedia", {
  writable: true,
  value: vi.fn().mockImplementation((query) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: vi.fn(), // deprecated
    removeListener: vi.fn(), // deprecated
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    dispatchEvent: vi.fn(),
  })),
});

Object.defineProperty(window, "FontFace", {
  enumerable: true,
  value: class {
    private family: string;
    private source: string;
    private descriptors: any;
    private status: string;
    private unicodeRange: string;

    constructor(family, source, descriptors) {
      this.family = family;
      this.source = source;
      this.descriptors = descriptors;
      this.status = "unloaded";
      this.unicodeRange = "U+0000-00FF";
    }

    load() {
      this.status = "loaded";
    }
  },
});

Object.defineProperty(document, "fonts", {
  value: {
    load: vi.fn().mockResolvedValue([]),
    check: vi.fn().mockResolvedValue(true),
    has: vi.fn().mockResolvedValue(true),
    add: vi.fn(),
  },
});

Object.defineProperty(window, "EXCALIDRAW_ASSET_PATH", {
  value: `file://${__dirname}/`,
});

const originalFetch = globalThis.fetch.bind(globalThis);
const publicDirUrl = pathToFileURL(path.resolve(__dirname, "public") + path.sep);

const getContentType = (assetPath: string) => {
  if (assetPath.endsWith(".png")) {
    return "image/png";
  }

  if (assetPath.endsWith(".svg")) {
    return "image/svg+xml";
  }

  return "application/octet-stream";
};

globalThis.fetch = (async (input, init) => {
  if (typeof input === "string" && input.startsWith("/")) {
    const assetUrl = new URL(input.slice(1), publicDirUrl);

    try {
      const content = await fs.promises.readFile(assetUrl);

      return new Response(
        new Blob([content], {
          type: getContentType(input),
        }),
        { status: 200 },
      );
    } catch {
      return new Response(null, { status: 404 });
    }
  }

  return originalFetch(input, init);
}) as typeof fetch;

// mock the font fetch only, so that everything else, as font subsetting, can run inside of the (snapshot) tests
vi.mock(
  "./packages/excalidraw/fonts/ExcalidrawFontFace",
  async (importOriginal) => {
    const mod = await importOriginal<
      typeof import("./packages/excalidraw/fonts/ExcalidrawFontFace")
    >();
    const ExcalidrawFontFaceImpl = mod.ExcalidrawFontFace;

    return {
      ...mod,
      ExcalidrawFontFace: class extends ExcalidrawFontFaceImpl {
        public async fetchFont(url: URL): Promise<ArrayBuffer> {
          if (!url.toString().startsWith("file://")) {
            return super.fetchFont(url);
          }

          // read local assets directly, without running a server
          const content = await fs.promises.readFile(url);
          return content.buffer;
        }
      },
    };
  },
);

// ReactDOM is located inside index.tsx file
// as a result, we need a place for it to render into
const element = document.createElement("div");
element.id = "root";
document.body.appendChild(element);

const _consoleError = console.error.bind(console);
console.error = (...args) => {
  // the react's act() warning usually doesn't contain any useful stack trace
  // so we're catching the log and re-logging the message with the test name,
  // also stripping the actual component stack trace as it's not useful
  if (args[0]?.includes?.("act(")) {
    _consoleError(
      yellow(
        `<<< WARNING: test "${
          expect.getState().currentTestName
        }" does not wrap some state update in act() >>>`,
      ),
    );
  } else {
    _consoleError(...args);
  }
};
