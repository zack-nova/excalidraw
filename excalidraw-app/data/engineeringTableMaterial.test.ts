import { getDefaultAppState } from "@excalidraw/excalidraw/appState";
import { newElementWith } from "@excalidraw/element";

import { describe, expect, it } from "vitest";

import {
  ENGINEERING_TABLE_MATERIAL_MAX_SIZE,
  createEngineeringTableMaterialLibraryItem,
  getSelectedEngineeringTableMaterialContext,
  resizeSelectedEngineeringTableMaterial,
} from "./engineeringTableMaterial";

import type {
  ExcalidrawElement,
  ExcalidrawTextElement,
} from "@excalidraw/element/types";
import type { AppState } from "@excalidraw/excalidraw/types";

const getMeta = (element: ExcalidrawElement) =>
  (element.customData as Record<string, any> | undefined)
    ?.engineeringTableMaterial as
    | {
        role: "cell" | "text";
        row: number;
        col: number;
      }
    | undefined;

const getCell = (
  elements: readonly ExcalidrawElement[],
  row: number,
  col: number,
) =>
  elements.find((element) => {
    const meta = getMeta(element);
    return meta?.role === "cell" && meta.row === row && meta.col === col;
  });

const getText = (
  elements: readonly ExcalidrawElement[],
  row: number,
  col: number,
) =>
  elements.find((element) => {
    const meta = getMeta(element);
    return meta?.role === "text" && meta.row === row && meta.col === col;
  });

describe("engineering table material", () => {
  it("creates a 3x3 table library item with editable text cells", () => {
    const item = createEngineeringTableMaterialLibraryItem();

    const cells = item.elements.filter(
      (element) => getMeta(element)?.role === "cell",
    );
    const texts = item.elements.filter(
      (element) => getMeta(element)?.role === "text",
    );

    expect(item.name).toBe("变量表格 (3x3)");
    expect(cells).toHaveLength(9);
    expect(texts).toHaveLength(9);
    expect(getCell(item.elements, 0, 0)).toBeDefined();
    expect(getText(item.elements, 2, 2)).toBeDefined();
  });

  it("resizes selected table and preserves existing cell template text", () => {
    const item = createEngineeringTableMaterialLibraryItem();
    const initialElements = item.elements as ExcalidrawElement[];
    const sourceText = getText(initialElements, 0, 0);
    if (!sourceText || sourceText.type !== "text") {
      throw new Error("missing table text element");
    }

    const withTemplate = initialElements.map((element) => {
      if (element.id === sourceText.id && element.type === "text") {
        return newElementWith(element as ExcalidrawTextElement, {
          text: "{{data[var:ambient].value}}",
          originalText: "{{data[var:ambient].value}}",
        });
      }
      return element;
    });

    const sourceCell = getCell(withTemplate, 0, 0);
    if (!sourceCell) {
      throw new Error("missing table cell element");
    }

    const appState: AppState = {
      ...getDefaultAppState(),
      width: 1280,
      height: 720,
      offsetTop: 0,
      offsetLeft: 0,
      selectedElementIds: {
        [sourceCell.id]: true,
      },
    };

    const resized = resizeSelectedEngineeringTableMaterial({
      elements: withTemplate,
      appState,
      operation: "addRow",
    });

    expect(resized).toBeTruthy();
    if (!resized) {
      return;
    }

    const resizedContext = getSelectedEngineeringTableMaterialContext({
      elements: resized.elements,
      appState: {
        ...appState,
        selectedElementIds: resized.selectedElementIds,
      },
    });
    expect(resizedContext).toEqual(
      expect.objectContaining({
        rows: 4,
        cols: 3,
      }),
    );

    const resizedText = getText(resized.elements, 0, 0);
    expect(resizedText?.type).toBe("text");
    if (!resizedText || resizedText.type !== "text") {
      return;
    }
    expect(resizedText.originalText).toBe("{{data[var:ambient].value}}");
  });

  it("clamps table size to 20x20", () => {
    let elements = createEngineeringTableMaterialLibraryItem()
      .elements as ExcalidrawElement[];
    let selectedId = getCell(elements, 0, 0)?.id;

    for (let index = 0; index < ENGINEERING_TABLE_MATERIAL_MAX_SIZE + 5; index++) {
      if (!selectedId) {
        throw new Error("missing selected table element id");
      }
      const appState: AppState = {
        ...getDefaultAppState(),
        width: 1280,
        height: 720,
        offsetTop: 0,
        offsetLeft: 0,
        selectedElementIds: { [selectedId]: true },
      };
      const nextRows = resizeSelectedEngineeringTableMaterial({
        elements,
        appState,
        operation: "addRow",
      });
      if (!nextRows) {
        break;
      }
      elements = nextRows.elements;
      selectedId = Object.keys(nextRows.selectedElementIds)[0];
    }

    for (let index = 0; index < ENGINEERING_TABLE_MATERIAL_MAX_SIZE + 5; index++) {
      if (!selectedId) {
        throw new Error("missing selected table element id");
      }
      const appState: AppState = {
        ...getDefaultAppState(),
        width: 1280,
        height: 720,
        offsetTop: 0,
        offsetLeft: 0,
        selectedElementIds: { [selectedId]: true },
      };
      const nextCols = resizeSelectedEngineeringTableMaterial({
        elements,
        appState,
        operation: "addColumn",
      });
      if (!nextCols) {
        break;
      }
      elements = nextCols.elements;
      selectedId = Object.keys(nextCols.selectedElementIds)[0];
    }

    const appState: AppState = {
      ...getDefaultAppState(),
      width: 1280,
      height: 720,
      offsetTop: 0,
      offsetLeft: 0,
      selectedElementIds: selectedId ? { [selectedId]: true } : {},
    };
    const context = getSelectedEngineeringTableMaterialContext({
      elements,
      appState,
    });

    expect(context).toEqual(
      expect.objectContaining({
        rows: ENGINEERING_TABLE_MATERIAL_MAX_SIZE,
        cols: ENGINEERING_TABLE_MATERIAL_MAX_SIZE,
      }),
    );
  });
});
