import { act, queryByTestId } from "@testing-library/react";
import React from "react";
import { vi } from "vitest";

import { MIME_TYPES, ORIG_ID } from "@excalidraw/common";

import { getCommonBoundingBox, newImageElement } from "@excalidraw/element";

import type {
  ExcalidrawGenericElement,
  FileId,
} from "@excalidraw/element/types";

import { parseLibraryJSON } from "../data/blob";
import { serializeLibraryAsJSON } from "../data/json";
import { distributeLibraryItemsOnSquareGrid } from "../data/library";
import { Excalidraw } from "../index";

import { API } from "./helpers/api";
import { mockHTMLImageElement } from "./helpers/mocks";
import { UI } from "./helpers/ui";
import { fireEvent, render, screen, waitFor } from "./test-utils";

import type { BinaryFiles, DataURL, LibraryItem, LibraryItems } from "../types";

const { h } = window;

const libraryJSONPromise = API.readFile(
  "./fixtures/fixture_library.excalidrawlib",
  "utf8",
);

const mockLibraryFilePromise = new Promise<Blob>(async (resolve, reject) => {
  try {
    resolve(
      new Blob([await libraryJSONPromise], { type: MIME_TYPES.excalidrawlib }),
    );
  } catch (error) {
    reject(error);
  }
});

vi.mock("../data/filesystem.ts", async (importOriginal) => {
  const module = await importOriginal();
  return {
    __esmodule: true,
    //@ts-ignore
    ...module,
    fileOpen: vi.fn(() => mockLibraryFilePromise),
  };
});

describe("library items inserting", () => {
  beforeEach(async () => {
    const rectangle = API.createElement({
      id: "rectangle1",
      type: "rectangle",
      boundElements: [
        { type: "text", id: "text1" },
        { type: "arrow", id: "arrow1" },
      ],
    });
    const text = API.createElement({
      id: "text1",
      type: "text",
      text: "ola",
      containerId: "rectangle1",
    });
    const arrow = API.createElement({
      id: "arrow1",
      type: "arrow",
      endBinding: {
        elementId: "rectangle1",
        fixedPoint: [0.5, 1],
        mode: "orbit",
      },
    });

    const libraryItems: LibraryItems = [
      {
        id: "libraryItem_id0",
        status: "unpublished",
        elements: [rectangle, text, arrow],
        created: 0,
        name: "test",
      },
    ];

    await render(<Excalidraw initialData={{ libraryItems }} />);
  });

  afterEach(async () => {
    await act(() => {
      return h.app.library.resetLibrary();
    });
  });

  it("should regenerate ids but retain bindings on library insert", async () => {
    const libraryItems = await h.app.library.getLatestLibrary();

    expect(libraryItems.length).toBe(1);

    await API.drop([
      {
        kind: "string",
        value: JSON.stringify({
          itemIds: [libraryItems[0].id],
        }),
        type: MIME_TYPES.excalidrawlibIds,
      },
    ]);

    await waitFor(() => {
      const rectangle = h.elements.find((e) => e.type === "rectangle")!;
      const text = h.elements.find((e) => e.type === "text")!;
      const arrow = h.elements.find((e) => e.type === "arrow")!;
      expect(h.elements).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            type: "rectangle",
            id: expect.not.stringMatching("rectangle1"),
            boundElements: expect.arrayContaining([
              { type: "text", id: text.id },
              { type: "arrow", id: arrow.id },
            ]),
          }),
          expect.objectContaining({
            type: "text",
            id: expect.not.stringMatching("text1"),
            containerId: rectangle.id,
          }),
          expect.objectContaining({
            type: "arrow",
            id: expect.not.stringMatching("arrow1"),
            endBinding: expect.objectContaining({
              elementId: rectangle.id,
            }),
          }),
        ]),
      );
    });
  });
});

describe("library", () => {
  beforeEach(async () => {
    await render(<Excalidraw />);
    await act(() => {
      return h.app.library.resetLibrary();
    });
  });

  it("import library via drag&drop", async () => {
    expect(await h.app.library.getLatestLibrary()).toEqual([]);
    await API.drop([
      {
        kind: "file",
        type: MIME_TYPES.excalidrawlib,
        file: await API.loadFile("./fixtures/fixture_library.excalidrawlib"),
      },
    ]);
    await waitFor(async () => {
      expect(await h.app.library.getLatestLibrary()).toEqual([
        {
          status: "unpublished",
          elements: [expect.objectContaining({ id: "A" })],
          id: expect.any(String),
          created: expect.any(Number),
        },
      ]);
    });
  });

  // NOTE: mocked to test logic, not actual drag&drop via UI
  it("drop library item onto canvas", async () => {
    expect(h.elements).toEqual([]);
    const libraryItems = parseLibraryJSON(await libraryJSONPromise);
    await API.drop([
      {
        kind: "string",
        value: serializeLibraryAsJSON(libraryItems),
        type: MIME_TYPES.excalidrawlib,
      },
    ]);
    await waitFor(() => {
      expect(h.elements).toEqual([expect.objectContaining({ [ORIG_ID]: "A" })]);
    });
  });

  it("should fix duplicate ids between items on insert", async () => {
    // note, we're not testing for duplicate group ids and such because
    // deduplication of that happens upstream in the library component
    // which would be very hard to orchestrate in this test

    const elem1 = API.createElement({
      id: "elem1",
      type: "rectangle",
    });
    const item1: LibraryItem = {
      id: "item1",
      status: "published",
      elements: [elem1],
      created: 1,
    };

    await API.drop([
      {
        kind: "string",
        value: serializeLibraryAsJSON([item1, item1]),
        type: MIME_TYPES.excalidrawlib,
      },
    ]);

    await waitFor(() => {
      expect(h.elements).toEqual([
        expect.objectContaining({
          [ORIG_ID]: "elem1",
        }),
        expect.objectContaining({
          id: expect.not.stringMatching(/^elem1$/),
          [ORIG_ID]: expect.not.stringMatching(/^\w+$/),
        }),
      ]);
    });
  });

  it("inserting library item should revert to selection tool", async () => {
    UI.clickTool("rectangle");
    expect(h.elements).toEqual([]);
    const libraryItems = parseLibraryJSON(await libraryJSONPromise);
    await API.drop([
      {
        kind: "string",
        value: serializeLibraryAsJSON(libraryItems),
        type: MIME_TYPES.excalidrawlib,
      },
    ]);
    await waitFor(() => {
      expect(h.elements).toEqual([expect.objectContaining({ [ORIG_ID]: "A" })]);
    });
    // this has a high flake
    // expect(h.state.activeTool.type).toBe("selection");
  });

  it("dropping library ids onto canvas deduplicates repeated library items by id", async () => {
    const duplicateA: LibraryItem = {
      id: "duplicate-item",
      status: "published",
      elements: [
        API.createElement({ id: "duplicate-item-rect-1", type: "rectangle" }),
      ],
      created: 1,
      name: "重复组件",
    };
    const duplicateB: LibraryItem = {
      id: "duplicate-item",
      status: "published",
      elements: [
        API.createElement({ id: "duplicate-item-rect-2", type: "rectangle" }),
      ],
      created: 2,
      name: "重复组件",
    };

    await act(() =>
      h.app.library.updateLibrary({
        libraryItems: [duplicateA, duplicateB],
        merge: false,
      }),
    );

    await API.drop([
      {
        kind: "string",
        value: JSON.stringify({
          itemIds: ["duplicate-item"],
        }),
        type: MIME_TYPES.excalidrawlibIds,
      },
    ]);

    await waitFor(() => {
      expect(h.elements).toHaveLength(1);
    });
  });
});

describe("library menu", () => {
  const createSourcedLibraryItem = ({
    id,
    name,
    sourceId,
    sourceName,
    sourceKind,
    componentGroup,
  }: {
    id: string;
    name: string;
    sourceId?: string;
    sourceName?: string;
    sourceKind?: "personal" | "public";
    componentGroup?: string;
  }) =>
    ({
      id,
      status: sourceKind === "public" ? "published" : "unpublished",
      elements: [API.createElement({ id: `${id}-rect`, type: "rectangle" })],
      created: Date.now(),
      name,
      sourceId,
      sourceName,
      sourceKind,
      componentGroup,
    } as LibraryItem);

  it("should load library from file picker", async () => {
    const { container } = await render(<Excalidraw />);

    const latestLibrary = await h.app.library.getLatestLibrary();
    expect(latestLibrary.length).toBe(0);

    const libraryButton = container.querySelector(".sidebar-trigger");

    fireEvent.click(libraryButton!);
    fireEvent.click(
      queryByTestId(
        container.querySelector(".layer-ui__library")!,
        "dropdown-menu-button",
      )!,
    );
    fireEvent.click(queryByTestId(container, "lib-dropdown--load")!);

    const libraryItems = parseLibraryJSON(await libraryJSONPromise);

    await waitFor(async () => {
      const latestLibrary = await h.app.library.getLatestLibrary();
      expect(latestLibrary.length).toBeGreaterThan(0);
      expect(latestLibrary.length).toBe(libraryItems.length);
      const { versionNonce, ...strippedElement } = libraryItems[0]?.elements[0]; // stripped due to mutations
      expect(latestLibrary[0].elements).toEqual([
        expect.objectContaining(strippedElement),
      ]);
    });
  });

  it("orders personal library, add button, and external source accordions", async () => {
    const selectedElement = API.createElement({
      id: "selected-rect",
      type: "rectangle",
    });
    const libraryItems: LibraryItems = [
      createSourcedLibraryItem({
        id: "personal-item",
        name: "我的组件",
        sourceKind: "personal",
      }),
      createSourcedLibraryItem({
        id: "fuel-item",
        name: "CoalSource",
        sourceId: "xjtu-library",
        sourceName: "西交大素材库",
        sourceKind: "public",
        componentGroup: "燃料设备",
      }),
      createSourcedLibraryItem({
        id: "valve-item",
        name: "WaterValve",
        sourceId: "xjtu-library",
        sourceName: "西交大素材库",
        sourceKind: "public",
        componentGroup: "汽水连接件",
      }),
    ];

    const { container } = await render(
      <Excalidraw
        initialData={{
          elements: [selectedElement],
          appState: {
            selectedElementIds: {
              [selectedElement.id]: true,
            },
          },
          libraryItems,
        }}
      />,
    );

    await act(async () => {
      fireEvent.click(container.querySelector(".sidebar-trigger")!);
    });

    const personalTitle = screen.getByText("Personal Library");
    const addButtonTile = container.querySelector(".library-unit__pulse");
    const sourceButton = screen.getByRole("button", {
      name: "西交大素材库",
    });

    expect(addButtonTile).not.toBeNull();
    expect(
      personalTitle.compareDocumentPosition(addButtonTile!) &
        Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
    expect(screen.queryByText("Other Libraries")).toBe(null);
    expect(
      addButtonTile!.compareDocumentPosition(sourceButton) &
        Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
    expect(sourceButton).toBeInTheDocument();
  });

  it("groups items by source and group, and restores collapsed state after search", async () => {
    const libraryItems: LibraryItems = [
      createSourcedLibraryItem({
        id: "personal-item",
        name: "我的组件",
        sourceKind: "personal",
      }),
      createSourcedLibraryItem({
        id: "fuel-item",
        name: "CoalSource",
        sourceId: "xjtu-library",
        sourceName: "西交大素材库",
        sourceKind: "public",
        componentGroup: "燃料设备",
      }),
      createSourcedLibraryItem({
        id: "valve-item",
        name: "WaterValve",
        sourceId: "xjtu-library",
        sourceName: "西交大素材库",
        sourceKind: "public",
        componentGroup: "汽水连接件",
      }),
    ];

    const { container } = await render(
      <Excalidraw initialData={{ libraryItems }} />,
    );

    fireEvent.click(container.querySelector(".sidebar-trigger")!);

    const source = await screen.findByRole("button", {
      name: "西交大素材库",
    });

    fireEvent.click(source);
    expect(source).toHaveAttribute("aria-expanded", "false");

    const searchInput = screen.getByPlaceholderText("Search library");
    fireEvent.change(searchInput, { target: { value: "WaterValve" } });

    await waitFor(() => {
      expect(
        screen.getByRole("button", {
          name: "西交大素材库",
        }),
      ).toHaveAttribute("aria-expanded", "true");
      expect(
        screen.getByRole("button", {
          name: "汽水连接件",
        }),
      ).toHaveAttribute("aria-expanded", "true");
      expect(screen.queryByRole("button", { name: "燃料设备" })).toBe(null);
      expect(container.querySelectorAll(".library-unit__active").length).toBe(
        1,
      );
    });

    fireEvent.change(searchInput, { target: { value: "" } });

    await waitFor(() => {
      expect(
        screen.getByRole("button", {
          name: "西交大素材库",
        }),
      ).toHaveAttribute("aria-expanded", "false");
    });
  });

  it("hides the group accordion when a library only has one group", async () => {
    const libraryItems: LibraryItems = [
      createSourcedLibraryItem({
        id: "single-group-item",
        name: "单分组组件",
        sourceId: "single-library",
        sourceName: "单分组素材库",
        sourceKind: "public",
        componentGroup: "唯一分组",
      }),
    ];

    const { container } = await render(
      <Excalidraw initialData={{ libraryItems }} />,
    );

    fireEvent.click(container.querySelector(".sidebar-trigger")!);

    expect(
      await screen.findByRole("button", {
        name: "单分组素材库",
      }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("button", {
        name: "唯一分组",
      }),
    ).toBe(null);
    expect(await screen.findByLabelText("单分组组件")).toBeInTheDocument();
  });

  it("inserts grouped image library items with file data and component payload", async () => {
    mockHTMLImageElement(40, 40);

    const fileId = "component-file" as FileId;
    const files: BinaryFiles = {
      [fileId]: {
        id: fileId,
        mimeType: MIME_TYPES.png,
        dataURL:
          "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4//8/AwAF/gL+p42lWAAAAABJRU5ErkJggg==" as DataURL,
        created: Date.now(),
      },
    };

    const imageElement = newImageElement({
      type: "image",
      x: 0,
      y: 0,
      width: 40,
      height: 40,
      status: "saved",
      fileId,
      customData: {
        component: {
          group: "燃料设备",
          data: {
            component_type: "CoalSource",
            name_cn: "煤/燃料",
          },
        },
      },
    });

    const libraryItems: LibraryItems = [
      {
        id: "coal-item",
        status: "unpublished",
        created: Date.now(),
        name: "煤/燃料",
        sourceId: "fuel-library",
        sourceName: "燃料素材库",
        sourceKind: "public",
        componentGroup: "燃料设备",
        elements: [imageElement],
        files,
      } as LibraryItem,
    ];

    const { container } = await render(
      <Excalidraw initialData={{ libraryItems }} />,
    );

    fireEvent.click(container.querySelector(".sidebar-trigger")!);

    fireEvent.click(await screen.findByLabelText("煤/燃料"));

    await waitFor(() => {
      expect(h.elements).toEqual([
        expect.objectContaining({
          type: "image",
          fileId,
          customData: expect.objectContaining({
            component: expect.objectContaining({
              group: "燃料设备",
              data: expect.objectContaining({
                component_type: "CoalSource",
              }),
            }),
          }),
        }),
      ]);
      expect(h.app.files[fileId]).toEqual(
        expect.objectContaining({
          id: fileId,
          mimeType: MIME_TYPES.png,
        }),
      );
    });
  });

  it("deduplicates repeated library items by id when rendering and inserting", async () => {
    const duplicateA = createSourcedLibraryItem({
      id: "duplicate-item",
      name: "重复组件",
      sourceId: "xjtu-library",
      sourceName: "西交大素材库",
      sourceKind: "public",
      componentGroup: "燃料设备",
    });

    const duplicateB = {
      ...createSourcedLibraryItem({
        id: "duplicate-item",
        name: "重复组件",
        sourceId: "xjtu-library",
        sourceName: "西交大素材库",
        sourceKind: "public",
        componentGroup: "燃料设备",
      }),
      elements: [
        API.createElement({ id: "duplicate-item-rect-2", type: "rectangle" }),
      ],
    } as LibraryItem;

    const { container } = await render(
      <Excalidraw initialData={{ libraryItems: [duplicateA, duplicateB] }} />,
    );

    fireEvent.click(container.querySelector(".sidebar-trigger")!);

    await waitFor(() => {
      expect(screen.getAllByLabelText("重复组件")).toHaveLength(1);
    });

    fireEvent.click(screen.getByLabelText("重复组件"));

    await waitFor(() => {
      expect(h.elements).toHaveLength(1);
    });
  });
});

describe("distributeLibraryItemsOnSquareGrid()", () => {
  it("should distribute items on a grid", async () => {
    const createLibraryItem = (
      elements: ExcalidrawGenericElement[],
    ): LibraryItem => {
      return {
        id: `id-${Date.now()}`,
        elements,
        status: "unpublished",
        created: Date.now(),
      };
    };

    const PADDING = 50;

    const el1 = API.createElement({
      id: "id1",
      width: 100,
      height: 100,
      x: 0,
      y: 0,
    });

    const el2 = API.createElement({
      id: "id2",
      width: 100,
      height: 80,
      x: -100,
      y: -50,
    });

    const el3 = API.createElement({
      id: "id3",
      width: 40,
      height: 50,
      x: -100,
      y: -50,
    });

    const el4 = API.createElement({
      id: "id4",
      width: 50,
      height: 50,
      x: 0,
      y: 0,
    });

    const el5 = API.createElement({
      id: "id5",
      width: 70,
      height: 100,
      x: 40,
      y: 0,
    });

    const libraryItems: LibraryItems = [
      createLibraryItem([el1]),
      createLibraryItem([el2]),
      createLibraryItem([el3]),
      createLibraryItem([el4, el5]),
    ];

    const distributed = distributeLibraryItemsOnSquareGrid(libraryItems);
    // assert the returned library items are flattened to elements
    expect(distributed.length).toEqual(
      libraryItems.map((x) => x.elements).flat().length,
    );
    expect(distributed).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: el1.id,
          x: 0,
          y: 0,
        }),
        expect.objectContaining({
          id: el2.id,
          x:
            el1.width +
            PADDING +
            (getCommonBoundingBox([el4, el5]).width - el2.width) / 2,
          y: Math.abs(el1.height - el2.height) / 2,
        }),
        expect.objectContaining({
          id: el3.id,
          x: Math.abs(el1.width - el3.width) / 2,
          y:
            Math.max(el1.height, el2.height) +
            PADDING +
            Math.abs(el3.height - Math.max(el4.height, el5.height)) / 2,
        }),
        expect.objectContaining({
          id: el4.id,
          x: Math.max(el1.width, el2.width) + PADDING,
          y: Math.max(el1.height, el2.height) + PADDING,
        }),
        expect.objectContaining({
          id: el5.id,
          x: Math.max(el1.width, el2.width) + PADDING + Math.abs(el5.x - el4.x),
          y:
            Math.max(el1.height, el2.height) +
            PADDING +
            Math.abs(el5.y - el4.y),
        }),
      ]),
    );
  });
});
