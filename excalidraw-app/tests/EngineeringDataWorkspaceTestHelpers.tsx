import { newElementWith } from "@excalidraw/element";
import type { NonDeletedExcalidrawElement } from "@excalidraw/element/types";
import { API } from "@excalidraw/excalidraw/tests/helpers/api";
import { Pointer } from "@excalidraw/excalidraw/tests/helpers/ui";
import { configure } from "@testing-library/react";
import { beforeEach, vi } from "vitest";

import { appJotaiStore as localAppJotaiStore } from "../app-jotai";
import {
  engineeringCalculationRunsAtom,
  engineeringLastCalculationRequestAtom,
  engineeringLiveSnapshotsAtom,
  engineeringRunRuntimeAtom,
  engineeringSelectedCalculationRunIdAtom,
} from "../engineering/engineering-domain-state";

vi.mock("@excalidraw/common", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@excalidraw/common")>();
  return {
    ...actual,
    isRunningInIframe: () => true,
  };
});

configure({
  asyncUtilTimeout: 10_000,
});

export const PANEL_WIDTH_STORAGE_KEY =
  "engineering:selected-shape-actions-widths:v1";
const ENGINEERING_TABLE_META_KEY = "engineeringTableMaterial";

export const mouse = new Pointer("mouse");

export const createEngineeringImage = ({
  id,
  name,
  componentType,
  anchors,
  x,
  y,
}: {
  id: string;
  name: string;
  componentType: string;
  anchors?: Record<string, unknown>[];
  x?: number;
  y?: number;
}) => {
  const image = API.createElement({
    id,
    type: "image",
    ...(typeof x === "number" ? { x } : {}),
    ...(typeof y === "number" ? { y } : {}),
    width: 120,
    height: 80,
  });

  (
    image as typeof image & {
      customData: Record<string, unknown>;
    }
  ).customData = {
    component: {
      id,
      uuid: `${id}:uuid`,
      type: "component",
      isEngineeringComponent: true,
      position: { x: image.x, y: image.y },
      measured: { width: image.width, height: image.height },
      data: {
        name,
        name_cn: name,
        component_type: componentType,
        anchors: anchors ?? [
          {
            id: "anchor-in",
            uuid: "anchor-in",
            node_id: "node-in",
            position: { x: 0, y: 0.5 },
            data: {
              name: "Inlet",
              name_cn: "入口",
              interface_type: "Inlet",
              connection_type: "inlet",
              is_connected: false,
              is_visible: true,
              allow_not_display: false,
              material_type: "water",
              tpis_extra_info: null,
            },
          },
          {
            id: "anchor-out",
            uuid: "anchor-out",
            node_id: "node-out",
            position: { x: 1, y: 0.5 },
            data: {
              name: "Outlet",
              name_cn: "出口",
              interface_type: "Outlet",
              connection_type: "outlet",
              is_connected: false,
              is_visible: true,
              allow_not_display: false,
              material_type: "gas",
              tpis_extra_info: null,
            },
          },
        ],
      },
    },
  };

  return image;
};

const getTableMeta = (element: { customData?: Record<string, unknown> }) => {
  const tableMeta = element.customData?.[
    ENGINEERING_TABLE_META_KEY
  ] as
    | {
        role?: unknown;
        row?: unknown;
        col?: unknown;
      }
    | undefined;

  if (!tableMeta || typeof tableMeta !== "object") {
    return null;
  }

  if (
    (tableMeta.role !== "cell" && tableMeta.role !== "text") ||
    typeof tableMeta.row !== "number" ||
    typeof tableMeta.col !== "number"
  ) {
    return null;
  }

  return {
    role: tableMeta.role,
    row: tableMeta.row,
    col: tableMeta.col,
  } as const;
};

export const getTableCellAt = (
  elements: readonly NonDeletedExcalidrawElement[],
  row: number,
  col: number,
) =>
  elements.find((element) => {
    const meta = getTableMeta(element);
    return meta?.role === "cell" && meta.row === row && meta.col === col;
  });

export const withTableTemplateAt = ({
  elements,
  row,
  col,
  template,
}: {
  elements: readonly NonDeletedExcalidrawElement[];
  row: number;
  col: number;
  template: string;
}) =>
  elements.map((element) => {
    const meta = getTableMeta(element);
    if (
      element.type === "text" &&
      meta?.role === "text" &&
      meta.row === row &&
      meta.col === col
    ) {
      return newElementWith(element, {
        text: template,
        originalText: template,
      });
    }

    return element;
  });

export const setupEngineeringWorkspaceBeforeEach = () => {
  beforeEach(() => {
    window.localStorage.removeItem(PANEL_WIDTH_STORAGE_KEY);
    localAppJotaiStore.set(engineeringCalculationRunsAtom, {});
    localAppJotaiStore.set(engineeringSelectedCalculationRunIdAtom, null);
    localAppJotaiStore.set(engineeringLiveSnapshotsAtom, {});
    localAppJotaiStore.set(engineeringRunRuntimeAtom, {
      activeRunId: null,
      status: "idle",
      requestedAt: null,
      errorMessage: null,
    });
    localAppJotaiStore.set(engineeringLastCalculationRequestAtom, null);
  });
};

export { appJotaiStore } from "../app-jotai";
export { default as ExcalidrawApp } from "../App";
export { resolveEngineeringHoverTarget } from "../components/EngineeringHoverPreviewOverlay";
export { componentCurveCatalogAtom } from "../component-spec-store";
export { createEngineeringChartMaterialLibraryItems } from "../data/engineeringChartMaterial";
export { publishEngineeringData } from "../data/engineeringData";
export { createEngineeringTableMaterialLibraryItem } from "../data/engineeringTableMaterial";
export { createProjectDocument } from "../engineering/engineering-domain";
export {
  engineeringCalculationRunsAtom,
  engineeringLastCalculationRequestAtom,
  engineeringProjectDocumentAtom,
  engineeringRunRuntimeAtom,
  engineeringScenarioDocumentAtom,
  engineeringSelectedCalculationRunIdAtom,
} from "../engineering/engineering-domain-state";
export { engineeringWorkspaceModeAtom } from "../engineering/engineering-ui-state";

export {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
  withExcalidrawDimensions,
  within,
} from "@excalidraw/excalidraw/tests/test-utils";
export { sceneCoordsToViewportCoords } from "@excalidraw/common";
export { CaptureUpdateAction } from "@excalidraw/excalidraw";
export { API } from "@excalidraw/excalidraw/tests/helpers/api";
export { pointFrom } from "@excalidraw/math";
