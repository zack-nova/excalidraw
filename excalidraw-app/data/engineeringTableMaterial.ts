import {
  getSelectedElements,
  newElement,
  newElementWith,
  newTextElement,
} from "@excalidraw/element";

import type {
  ExcalidrawElement,
  NonDeletedExcalidrawElement,
  ExcalidrawTextElement,
} from "@excalidraw/element/types";
import type { AppState, LibraryItem } from "@excalidraw/excalidraw/types";

export const ENGINEERING_TABLE_MATERIAL_MAX_SIZE = 20;
export const ENGINEERING_TABLE_MATERIAL_DEFAULT_ROWS = 3;
export const ENGINEERING_TABLE_MATERIAL_DEFAULT_COLS = 3;

const ENGINEERING_TABLE_MATERIAL_LIBRARY_ITEM_ID =
  "component-library:engineering-table-material:3x3";
const ENGINEERING_TABLE_MATERIAL_LIBRARY_GROUP_ID =
  "engineering-table-material:library-group";
const ENGINEERING_TABLE_MATERIAL_META_KEY = "engineeringTableMaterial";
const ENGINEERING_TABLE_MATERIAL_CELL_WIDTH = 128;
const ENGINEERING_TABLE_MATERIAL_CELL_HEIGHT = 56;

type TableMaterialRole = "cell" | "text";

type EngineeringTableMaterialMeta = {
  kind: "table";
  role: TableMaterialRole;
  row: number;
  col: number;
  rows: number;
  cols: number;
};

type TableMaterialTextStyle = Pick<
  ExcalidrawTextElement,
  | "fontSize"
  | "fontFamily"
  | "textAlign"
  | "verticalAlign"
  | "lineHeight"
  | "strokeColor"
  | "backgroundColor"
  | "roundness"
  | "opacity"
>;

type TableMaterialCellStyle = Pick<
  ExcalidrawElement,
  | "strokeColor"
  | "backgroundColor"
  | "fillStyle"
  | "strokeWidth"
  | "strokeStyle"
  | "roughness"
  | "roundness"
  | "opacity"
>;

type BuiltTableElements = {
  elements: NonDeletedExcalidrawElement[];
  firstSelectableElementId: string | null;
};

export type SelectedEngineeringTableMaterialContext = {
  groupId: string;
  rows: number;
  cols: number;
  originX: number;
  originY: number;
};

export type EngineeringTableMaterialResizeOperation =
  | "addRow"
  | "removeRow"
  | "addColumn"
  | "removeColumn";

const isRecord = (value: unknown): value is Record<string, unknown> =>
  !!value && typeof value === "object" && !Array.isArray(value);

const toNonNegativeInteger = (value: unknown) =>
  typeof value === "number" &&
  Number.isFinite(value) &&
  value >= 0 &&
  Number.isInteger(value)
    ? value
    : null;

const getEngineeringTableMaterialMeta = (element: ExcalidrawElement) => {
  const customData = isRecord(element.customData) ? element.customData : null;
  const metaValue = customData?.[ENGINEERING_TABLE_MATERIAL_META_KEY];
  if (!isRecord(metaValue)) {
    return null;
  }

  const kind = metaValue.kind;
  const role = metaValue.role;
  const row = toNonNegativeInteger(metaValue.row);
  const col = toNonNegativeInteger(metaValue.col);
  const rows = toNonNegativeInteger(metaValue.rows);
  const cols = toNonNegativeInteger(metaValue.cols);

  if (
    kind !== "table" ||
    (role !== "cell" && role !== "text") ||
    row === null ||
    col === null ||
    rows === null ||
    cols === null
  ) {
    return null;
  }

  return {
    kind,
    role,
    row,
    col,
    rows,
    cols,
  } as EngineeringTableMaterialMeta;
};

const toCellKey = (row: number, col: number) => `${row}:${col}`;

const getTemplateText = (element: ExcalidrawTextElement) => {
  if (typeof element.originalText === "string" && element.originalText.length > 0) {
    return element.originalText;
  }

  const customData = isRecord(element.customData) ? element.customData : null;
  const engineeringTemplate = customData?.engineeringTemplate;
  if (typeof engineeringTemplate === "string" && engineeringTemplate.length > 0) {
    return engineeringTemplate;
  }

  return element.text;
};

const getTargetGroupId = (
  selectedElements: readonly ExcalidrawElement[],
): string | null => {
  for (const element of selectedElements) {
    if (!getEngineeringTableMaterialMeta(element)) {
      continue;
    }
    if (element.groupIds.length > 0) {
      return element.groupIds[element.groupIds.length - 1];
    }
  }
  return null;
};

const buildTableMaterialElements = ({
  rows,
  cols,
  originX,
  originY,
  groupId,
  textByCellKey,
  cellWidth,
  cellHeight,
  explicitIdPrefix,
  textStyle,
  cellStyle,
}: {
  rows: number;
  cols: number;
  originX: number;
  originY: number;
  groupId: string;
  textByCellKey?: Record<string, string>;
  cellWidth: number;
  cellHeight: number;
  explicitIdPrefix?: string;
  textStyle?: Partial<TableMaterialTextStyle>;
  cellStyle?: Partial<TableMaterialCellStyle>;
}): BuiltTableElements => {
  const elements: NonDeletedExcalidrawElement[] = [];
  let firstSelectableElementId: string | null = null;

  for (let row = 0; row < rows; row++) {
    for (let col = 0; col < cols; col++) {
      const cellMeta: EngineeringTableMaterialMeta = {
        kind: "table",
        role: "cell",
        row,
        col,
        rows,
        cols,
      };
      const textMeta: EngineeringTableMaterialMeta = {
        ...cellMeta,
        role: "text",
      };
      const cellId = explicitIdPrefix
        ? `${explicitIdPrefix}:cell:${row}:${col}`
        : undefined;
      const textId = explicitIdPrefix
        ? `${explicitIdPrefix}:text:${row}:${col}`
        : undefined;
      const text = textByCellKey?.[toCellKey(row, col)] || "";

      const cell = newElement({
        type: "rectangle",
        ...(cellId ? { id: cellId } : {}),
        x: originX + col * cellWidth,
        y: originY + row * cellHeight,
        width: cellWidth,
        height: cellHeight,
        groupIds: [groupId],
        strokeColor: cellStyle?.strokeColor,
        backgroundColor: cellStyle?.backgroundColor,
        fillStyle: cellStyle?.fillStyle,
        strokeWidth: cellStyle?.strokeWidth,
        strokeStyle: cellStyle?.strokeStyle,
        roughness: cellStyle?.roughness,
        roundness: cellStyle?.roundness,
        opacity: cellStyle?.opacity,
        customData: {
          [ENGINEERING_TABLE_MATERIAL_META_KEY]: cellMeta,
        },
      });
      const textElement = newTextElement({
        ...(textId ? { id: textId } : {}),
        x: cell.x + cell.width / 2,
        y: cell.y + cell.height / 2,
        text,
        originalText: text,
        groupIds: [groupId],
        textAlign: textStyle?.textAlign,
        verticalAlign: textStyle?.verticalAlign,
        fontSize: textStyle?.fontSize,
        fontFamily: textStyle?.fontFamily,
        lineHeight: textStyle?.lineHeight,
        strokeColor: textStyle?.strokeColor,
        backgroundColor: textStyle?.backgroundColor,
        roundness: textStyle?.roundness,
        opacity: textStyle?.opacity,
        customData: {
          [ENGINEERING_TABLE_MATERIAL_META_KEY]: textMeta,
        },
      });

      if (!firstSelectableElementId) {
        firstSelectableElementId = cell.id;
      }

      elements.push(cell, textElement);
    }
  }

  return {
    elements,
    firstSelectableElementId,
  };
};

const getSelectedTableMaterialContext = ({
  elements,
  appState,
}: {
  elements: readonly ExcalidrawElement[];
  appState: AppState;
}) => {
  const selectedElements = getSelectedElements(elements, appState, {
    includeBoundTextElement: false,
    includeElementsInFrames: false,
  });
  const groupId = getTargetGroupId(selectedElements);
  if (!groupId) {
    return null;
  }

  const tableElements = elements.filter((element) => {
    if (element.isDeleted || !element.groupIds.includes(groupId)) {
      return false;
    }
    return !!getEngineeringTableMaterialMeta(element);
  });
  if (tableElements.length === 0) {
    return null;
  }

  const cellElements = tableElements.filter((element) => {
    const meta = getEngineeringTableMaterialMeta(element);
    return meta?.role === "cell";
  });
  if (cellElements.length === 0) {
    return null;
  }

  const firstCell = cellElements[0];
  const rows =
    Math.max(
      ...cellElements.map((element) => {
        const meta = getEngineeringTableMaterialMeta(element)!;
        return meta.row;
      }),
    ) + 1;
  const cols =
    Math.max(
      ...cellElements.map((element) => {
        const meta = getEngineeringTableMaterialMeta(element)!;
        return meta.col;
      }),
    ) + 1;

  const textByCellKey = tableElements.reduce<Record<string, string>>(
    (result, element) => {
      const meta = getEngineeringTableMaterialMeta(element);
      if (!meta || meta.role !== "text" || element.type !== "text") {
        return result;
      }
      result[toCellKey(meta.row, meta.col)] = getTemplateText(element);
      return result;
    },
    {},
  );

  const firstText = tableElements.find(
    (element): element is ExcalidrawTextElement =>
      element.type === "text" &&
      getEngineeringTableMaterialMeta(element)?.role === "text",
  );

  const textStyle = firstText
    ? {
        fontSize: firstText.fontSize,
        fontFamily: firstText.fontFamily,
        textAlign: firstText.textAlign,
        verticalAlign: firstText.verticalAlign,
        lineHeight: firstText.lineHeight,
        strokeColor: firstText.strokeColor,
        backgroundColor: firstText.backgroundColor,
        roundness: firstText.roundness,
        opacity: firstText.opacity,
      }
    : undefined;
  const cellStyle: Partial<TableMaterialCellStyle> = {
    strokeColor: firstCell.strokeColor,
    backgroundColor: firstCell.backgroundColor,
    fillStyle: firstCell.fillStyle,
    strokeWidth: firstCell.strokeWidth,
    strokeStyle: firstCell.strokeStyle,
    roughness: firstCell.roughness,
    roundness: firstCell.roundness,
    opacity: firstCell.opacity,
  };

  return {
    groupId,
    rows,
    cols,
    originX: firstCell.x,
    originY: firstCell.y,
    cellWidth: firstCell.width,
    cellHeight: firstCell.height,
    tableElements,
    textByCellKey,
    textStyle,
    cellStyle,
  };
};

export const getSelectedEngineeringTableMaterialContext = ({
  elements,
  appState,
}: {
  elements: readonly ExcalidrawElement[];
  appState: AppState;
}): SelectedEngineeringTableMaterialContext | null => {
  const context = getSelectedTableMaterialContext({ elements, appState });
  if (!context) {
    return null;
  }

  return {
    groupId: context.groupId,
    rows: context.rows,
    cols: context.cols,
    originX: context.originX,
    originY: context.originY,
  };
};

export const resizeSelectedEngineeringTableMaterial = ({
  elements,
  appState,
  operation,
}: {
  elements: readonly ExcalidrawElement[];
  appState: AppState;
  operation: EngineeringTableMaterialResizeOperation;
}) => {
  const context = getSelectedTableMaterialContext({ elements, appState });
  if (!context) {
    return null;
  }

  const rowDelta =
    operation === "addRow" ? 1 : operation === "removeRow" ? -1 : 0;
  const colDelta =
    operation === "addColumn" ? 1 : operation === "removeColumn" ? -1 : 0;
  const nextRows = Math.max(
    1,
    Math.min(ENGINEERING_TABLE_MATERIAL_MAX_SIZE, context.rows + rowDelta),
  );
  const nextCols = Math.max(
    1,
    Math.min(ENGINEERING_TABLE_MATERIAL_MAX_SIZE, context.cols + colDelta),
  );

  if (nextRows === context.rows && nextCols === context.cols) {
    return null;
  }

  const rebuiltTable = buildTableMaterialElements({
    rows: nextRows,
    cols: nextCols,
    originX: context.originX,
    originY: context.originY,
    groupId: context.groupId,
    textByCellKey: context.textByCellKey,
    cellWidth: context.cellWidth,
    cellHeight: context.cellHeight,
    textStyle: context.textStyle,
    cellStyle: context.cellStyle,
  });
  const tableElementIds = new Set(context.tableElements.map((element) => element.id));
  const nextElements = elements.map((element) =>
    tableElementIds.has(element.id)
      ? newElementWith(element, {
          isDeleted: true,
        })
      : element,
  );
  nextElements.push(...rebuiltTable.elements);

  return {
    elements: nextElements,
    selectedElementIds: rebuiltTable.firstSelectableElementId
      ? ({
          [rebuiltTable.firstSelectableElementId]: true,
        } as AppState["selectedElementIds"])
      : {},
    rows: nextRows,
    cols: nextCols,
  };
};

export const createEngineeringTableMaterialLibraryItem = (): LibraryItem => {
  const builtTable = buildTableMaterialElements({
    rows: ENGINEERING_TABLE_MATERIAL_DEFAULT_ROWS,
    cols: ENGINEERING_TABLE_MATERIAL_DEFAULT_COLS,
    originX: 0,
    originY: 0,
    groupId: ENGINEERING_TABLE_MATERIAL_LIBRARY_GROUP_ID,
    cellWidth: ENGINEERING_TABLE_MATERIAL_CELL_WIDTH,
    cellHeight: ENGINEERING_TABLE_MATERIAL_CELL_HEIGHT,
    explicitIdPrefix: "engineering-table-material:library:3x3",
  });

  return {
    id: ENGINEERING_TABLE_MATERIAL_LIBRARY_ITEM_ID,
    status: "unpublished",
    created: Date.now(),
    name: "变量表格 (3x3)",
    sourceId: "engineering-system",
    sourceName: "系统素材",
    sourceKind: "public",
    componentGroup: "表格",
    searchKeywords: ["表格", "变量", "table", "{{...}}"],
    elements: builtTable.elements,
  };
};
