import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
  withExcalidrawDimensions,
  within,
} from "@excalidraw/excalidraw/tests/test-utils";
import { sceneCoordsToViewportCoords } from "@excalidraw/common";
import { CaptureUpdateAction } from "@excalidraw/excalidraw";
import { newElementWith } from "@excalidraw/element";
import type { NonDeletedExcalidrawElement } from "@excalidraw/element/types";
import { API } from "@excalidraw/excalidraw/tests/helpers/api";
import { Pointer } from "@excalidraw/excalidraw/tests/helpers/ui";
import { pointFrom } from "@excalidraw/math";
import { configure } from "@testing-library/react";
import { vi } from "vitest";

import ExcalidrawApp from "../App";
import { appJotaiStore } from "../app-jotai";
import { resolveEngineeringHoverTarget } from "../components/EngineeringHoverPreviewOverlay";
import { componentCurveCatalogAtom } from "../component-spec-store";
import { createEngineeringChartMaterialLibraryItems } from "../data/engineeringChartMaterial";
import { publishEngineeringData } from "../data/engineeringData";
import { createEngineeringTableMaterialLibraryItem } from "../data/engineeringTableMaterial";
import { createProjectDocument } from "../engineering-domain";
import {
  engineeringCalculationRunsAtom,
  engineeringLastCalculationRequestAtom,
  engineeringLiveSnapshotsAtom,
  engineeringProjectDocumentAtom,
  engineeringRunRuntimeAtom,
  engineeringScenarioDocumentAtom,
  engineeringSelectedCalculationRunIdAtom,
} from "../engineering-domain-state";
import { engineeringWorkspaceModeAtom } from "../engineering-ui-state";

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

const PANEL_WIDTH_STORAGE_KEY = "engineering:selected-shape-actions-widths:v1";
const mouse = new Pointer("mouse");
const ENGINEERING_TABLE_META_KEY = "engineeringTableMaterial";

const createEngineeringImage = ({
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

const getTableCellAt = (
  elements: readonly NonDeletedExcalidrawElement[],
  row: number,
  col: number,
) =>
  elements.find((element) => {
    const meta = getTableMeta(element);
    return meta?.role === "cell" && meta.row === row && meta.col === col;
  });

const withTableTemplateAt = ({
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

describe("Engineering data workspace", () => {
  beforeEach(() => {
    window.localStorage.removeItem(PANEL_WIDTH_STORAGE_KEY);
    appJotaiStore.set(engineeringCalculationRunsAtom, {});
    appJotaiStore.set(engineeringSelectedCalculationRunIdAtom, null);
    appJotaiStore.set(engineeringLiveSnapshotsAtom, {});
    appJotaiStore.set(engineeringRunRuntimeAtom, {
      activeRunId: null,
      status: "idle",
      requestedAt: null,
      errorMessage: null,
    });
    appJotaiStore.set(engineeringLastCalculationRequestAtom, null);
  });

  it("shows lazily loaded input and output parameter specs for the selected component", async () => {
    appJotaiStore.set(engineeringWorkspaceModeAtom, "data");
    appJotaiStore.set(engineeringProjectDocumentAtom, createProjectDocument());
    appJotaiStore.set(componentCurveCatalogAtom, {
      curvesByType: {},
      loadStatusByType: {},
      errorsByType: {},
    });

    await render(<ExcalidrawApp />);

    await withExcalidrawDimensions({ width: 1920, height: 1080 }, async () => {
      const boiler = createEngineeringImage({
        id: "component:boiler",
        name: "锅炉",
        componentType: "Boiler",
      });

      API.updateScene({
        elements: [boiler],
        captureUpdate: CaptureUpdateAction.NEVER,
      });
      API.setSelectedElements([boiler]);

      await waitFor(() => {
        expect(
          screen.getByRole("tablist", { name: "Properties sections" }),
        ).toBeVisible();
      });

      fireEvent.click(screen.getByRole("tab", { name: /^Input$/i }));

      await waitFor(() => {
        const inputPanel = screen.getByRole("tabpanel", {
          name: /^Input$/i,
        });
        expect(within(inputPanel).getByText("机械不完全燃烧损失")).toBeVisible();
      });
      expect(
        within(screen.getByRole("tabpanel", { name: /^Input$/i })).getAllByText(
          "锅炉效率",
        ).length,
      ).toBeGreaterThan(0);

      fireEvent.click(screen.getByRole("tab", { name: /^Output$/i }));

      await waitFor(() => {
        expect(
          within(screen.getByRole("tabpanel", { name: /^Output$/i })).getByText(
            "锅炉热负荷",
          ),
        ).toBeVisible();
      });
      expect(
        within(screen.getByRole("tabpanel", { name: /^Output$/i })).queryAllByText(
          /backend_calculation/i,
        ),
      ).toHaveLength(0);
    });
  });

  it("shows engineering tabs for engineering components and actions/data tabs for normal shapes", async () => {
    appJotaiStore.set(engineeringWorkspaceModeAtom, "data");
    appJotaiStore.set(engineeringProjectDocumentAtom, createProjectDocument());
    appJotaiStore.set(componentCurveCatalogAtom, {
      curvesByType: {},
      loadStatusByType: {},
      errorsByType: {},
    });

    await render(<ExcalidrawApp />);

    await withExcalidrawDimensions({ width: 1920, height: 1080 }, async () => {
      const boiler = createEngineeringImage({
        id: "component:boiler",
        name: "锅炉",
        componentType: "Boiler",
      });
      const rectangle = API.createElement({
        id: "shape:rect",
        type: "rectangle",
        x: 320,
        y: 120,
        width: 120,
        height: 80,
      });

      API.updateScene({
        elements: [boiler, rectangle],
        captureUpdate: CaptureUpdateAction.NEVER,
      });

      API.setSelectedElements([boiler]);

      await waitFor(() => {
        const tablist = screen.getByRole("tablist", {
          name: "Properties sections",
        });
        expect(within(tablist).getAllByRole("tab")).toHaveLength(5);
      });
      expect(screen.getByRole("tab", { name: /^Input$/i })).toBeVisible();
      expect(screen.getByRole("tab", { name: /^Output$/i })).toBeVisible();
      expect(screen.getByRole("tab", { name: /^Anchors$/i })).toBeVisible();
      expect(screen.getByRole("tab", { name: /^Data$/i })).toBeVisible();
      expect(
        screen.getByRole("tab", { name: /placeholder|占位|待定/i }),
      ).toBeVisible();

      API.setSelectedElements([rectangle]);

      await waitFor(() => {
        const tablist = screen.getByRole("tablist", {
          name: "Properties sections",
        });
        expect(within(tablist).getAllByRole("tab")).toHaveLength(2);
      });

      expect(screen.getByRole("tab", { name: /^Actions$/i })).toBeVisible();
      expect(screen.getByRole("tab", { name: /^Data$/i })).toBeVisible();
      expect(screen.queryByRole("tab", { name: /^Input$/i })).toBeNull();
      expect(screen.queryByRole("tab", { name: /^Output$/i })).toBeNull();
      expect(screen.queryByRole("tab", { name: /^Anchors$/i })).toBeNull();
    });
  });

  it("[hover-overlay] shows component hover card with basic-group input parameters even when selected", async () => {
    appJotaiStore.set(engineeringWorkspaceModeAtom, "data");
    appJotaiStore.set(engineeringProjectDocumentAtom, createProjectDocument());
    appJotaiStore.set(componentCurveCatalogAtom, {
      curvesByType: {},
      loadStatusByType: {},
      errorsByType: {},
    });

    await render(<ExcalidrawApp />);

    await withExcalidrawDimensions({ width: 1920, height: 1080 }, async () => {
      const boiler = createEngineeringImage({
        id: "component:hover-overlay-boiler",
        name: "锅炉",
        componentType: "Boiler",
      });

      API.updateScene({
        elements: [boiler],
        captureUpdate: CaptureUpdateAction.NEVER,
      });

      API.setSelectedElements([boiler]);
      API.setAppState({
        hoveredElementIds: {
          [boiler.id]: true,
        },
      });

      const card = await screen.findByTestId("engineering-hover-preview-card");
      await waitFor(() => {
        expect(within(card).getByText(/元件名称:\s*锅炉/)).toBeVisible();
      });
      expect(within(card).getByText(/锅炉效率:\s*--%/)).toBeVisible();
      expect(within(card).queryByText(/主蒸汽压力:/)).not.toBeInTheDocument();
      expect(within(card).queryByText(/主流量-锅炉效率:/)).not.toBeInTheDocument();
      expect(card).toHaveStyle({ pointerEvents: "none" });

      API.setAppState({
        hoveredElementIds: {},
      });

      expect(screen.getByTestId("engineering-hover-preview-card")).toBeVisible();
      await waitFor(
        () => {
          expect(
            screen.queryByTestId("engineering-hover-preview-card"),
          ).not.toBeInTheDocument();
        },
        { timeout: 1200 },
      );
    });
  });

  it("[hover-overlay] shows anchor hover card with interface parameters and manual/runtime precedence", async () => {
    appJotaiStore.set(engineeringWorkspaceModeAtom, "data");
    appJotaiStore.set(engineeringProjectDocumentAtom, createProjectDocument());
    appJotaiStore.set(componentCurveCatalogAtom, {
      curvesByType: {},
      loadStatusByType: {},
      errorsByType: {},
    });

    await render(<ExcalidrawApp />);

    await withExcalidrawDimensions({ width: 1920, height: 1080 }, async () => {
      const boiler = createEngineeringImage({
        id: "component:hover-overlay-anchor-boiler",
        name: "锅炉",
        componentType: "Boiler",
      });

      API.updateScene({
        elements: [boiler],
        captureUpdate: CaptureUpdateAction.NEVER,
      });
      API.clearSelection();

      let anchorTemperatureVariableId = "";
      await waitFor(() => {
        const project = appJotaiStore.get(engineeringProjectDocumentAtom);
        const variable = Object.values(project.variableCatalog.variablesById).find(
          (candidate) =>
            candidate.owner.kind === "anchor" &&
            candidate.backend?.tpisKey === "T" &&
            candidate.owner.id.includes(`:${boiler.id}:anchor-out`),
        );

        expect(variable).toBeDefined();
        anchorTemperatureVariableId = variable!.id;
      });

      const project = appJotaiStore.get(engineeringProjectDocumentAtom);
      const scenario = appJotaiStore.get(engineeringScenarioDocumentAtom);
      const runtimeRunId = "run:hover-overlay-anchor";
      await act(async () => {
        appJotaiStore.set(engineeringCalculationRunsAtom, {
          [runtimeRunId]: {
            id: runtimeRunId,
            projectId: project.id,
            scenarioId: scenario.id,
            basedOn: {
              modelVersion: project.revisions.modelVersion,
              scenarioVersion: scenario.revisions.scenarioVersion,
            },
            status: "success",
            resultValues: {
              [anchorTemperatureVariableId]: {
                variableId: anchorTemperatureVariableId,
                value: 280,
                source: "backend_calculation",
                status: "ok",
              },
            },
            diagnostics: [],
          },
        });
        appJotaiStore.set(engineeringSelectedCalculationRunIdAtom, runtimeRunId);
        appJotaiStore.set(engineeringScenarioDocumentAtom, {
          ...scenario,
          manualInputs: {
            ...scenario.manualInputs,
            [anchorTemperatureVariableId]: {
              variableId: anchorTemperatureVariableId,
              value: 320,
              source: "frontend_manual_input",
              status: "ok",
            },
          },
        });
      });

      API.setAppState({
        hoveredElementIds: {
          [boiler.id]: true,
        },
        hoveredAnchorElementId: boiler.id,
        hoveredAnchorPointIndex: 1,
      });

      const card = await screen.findByTestId("engineering-hover-preview-card");
      await waitFor(() => {
        expect(within(card).getByText(/温度:\s*320℃/)).toBeVisible();
      });
      expect(within(card).getByText(/gas/i)).toBeVisible();
      expect(within(card).queryByText(/元件名称:/)).not.toBeInTheDocument();

      const nextScenario = appJotaiStore.get(engineeringScenarioDocumentAtom);
      const nextManualInputs = { ...nextScenario.manualInputs };
      delete nextManualInputs[anchorTemperatureVariableId];
      await act(async () => {
        appJotaiStore.set(engineeringScenarioDocumentAtom, {
          ...nextScenario,
          manualInputs: nextManualInputs,
        });
      });

      await waitFor(() => {
        expect(within(card).getByText(/温度:\s*280℃/)).toBeVisible();
      });
    });
  });

  it("[hover-overlay] only responds to engineering components", async () => {
    appJotaiStore.set(engineeringWorkspaceModeAtom, "data");
    appJotaiStore.set(engineeringProjectDocumentAtom, createProjectDocument());
    appJotaiStore.set(componentCurveCatalogAtom, {
      curvesByType: {},
      loadStatusByType: {},
      errorsByType: {},
    });

    await render(<ExcalidrawApp />);

    await withExcalidrawDimensions({ width: 1920, height: 1080 }, async () => {
      const boiler = createEngineeringImage({
        id: "component:hover-overlay-only-engineering",
        name: "锅炉",
        componentType: "Boiler",
        x: 120,
        y: 220,
      });
      const rectangle = API.createElement({
        id: "shape:hover-overlay-rect",
        type: "rectangle",
        x: 460,
        y: 220,
        width: 140,
        height: 100,
      });

      API.updateScene({
        elements: [boiler, rectangle],
        captureUpdate: CaptureUpdateAction.NEVER,
      });
      API.clearSelection();

      API.setAppState({
        hoveredElementIds: {
          [rectangle.id]: true,
        },
      });
      await waitFor(() => {
        expect(
          screen.queryByTestId("engineering-hover-preview-card"),
        ).not.toBeInTheDocument();
      });

      API.setAppState({
        hoveredElementIds: {
          [boiler.id]: true,
        },
      });
      const card = await screen.findByTestId("engineering-hover-preview-card");
      await waitFor(() => {
        expect(within(card).getByText(/元件名称:\s*锅炉/)).toBeVisible();
      });
    });
  });

  it("[hover-overlay] resolves engineering component hover from pointer hit when hoveredElementIds is empty", async () => {
    appJotaiStore.set(engineeringWorkspaceModeAtom, "data");
    appJotaiStore.set(engineeringProjectDocumentAtom, createProjectDocument());
    appJotaiStore.set(componentCurveCatalogAtom, {
      curvesByType: {},
      loadStatusByType: {},
      errorsByType: {},
    });

    await render(<ExcalidrawApp />);

    await withExcalidrawDimensions({ width: 1920, height: 1080 }, async () => {
      const boiler = createEngineeringImage({
        id: "component:hover-overlay-pointer-hit",
        name: "锅炉",
        componentType: "Boiler",
        x: 380,
        y: 320,
      });

      API.updateScene({
        elements: [boiler],
        captureUpdate: CaptureUpdateAction.NEVER,
      });
      API.clearSelection();
      API.setAppState({
        hoveredElementIds: {},
        hoveredAnchorElementId: null,
        hoveredAnchorPointIndex: null,
      });

      const centerViewportPoint = sceneCoordsToViewportCoords(
        {
          sceneX: boiler.x + boiler.width * 0.5,
          sceneY: boiler.y + boiler.height * 0.5,
        },
        window.h.state,
      );
      mouse.moveTo(centerViewportPoint.x, centerViewportPoint.y);

      const card = await screen.findByTestId("engineering-hover-preview-card");
      await waitFor(() => {
        expect(within(card).getByText(/元件名称:\s*锅炉/)).toBeVisible();
      });
    });
  });

  it("[hover-overlay] keeps working for hovered engineering component when another component is selected", async () => {
    appJotaiStore.set(engineeringWorkspaceModeAtom, "data");
    appJotaiStore.set(engineeringProjectDocumentAtom, createProjectDocument());
    appJotaiStore.set(componentCurveCatalogAtom, {
      curvesByType: {},
      loadStatusByType: {},
      errorsByType: {},
    });

    await render(<ExcalidrawApp />);

    await withExcalidrawDimensions({ width: 1920, height: 1080 }, async () => {
      const boilerA = createEngineeringImage({
        id: "component:hover-overlay-selected-a",
        name: "锅炉A",
        componentType: "Boiler",
        x: 120,
        y: 220,
      });
      const boilerB = createEngineeringImage({
        id: "component:hover-overlay-selected-b",
        name: "锅炉B",
        componentType: "Boiler",
        x: 520,
        y: 220,
      });

      API.updateScene({
        elements: [boilerA, boilerB],
        captureUpdate: CaptureUpdateAction.NEVER,
      });
      API.setSelectedElements([boilerA]);
      API.setAppState({
        hoveredElementIds: {
          [boilerB.id]: true,
        },
        hoveredAnchorElementId: null,
        hoveredAnchorPointIndex: null,
      });
      await waitFor(() => {
        expect(window.h.state.selectedElementIds[boilerA.id]).toBe(true);
      });
      expect(window.h.state.selectedElementIds[boilerB.id]).toBeUndefined();
      expect(window.h.state.hoveredElementIds[boilerB.id]).toBe(true);
      expect(API.getSelectedElements().map((element) => element.id)).toEqual([
        boilerA.id,
      ]);
      const hoverTarget = resolveEngineeringHoverTarget({
        workspaceMode: "data",
        elements: window.h.elements,
        appState: window.h.state,
        project: appJotaiStore.get(engineeringProjectDocumentAtom),
      });
      expect(hoverTarget).toMatchObject({
        kind: "component",
        elementId: boilerB.id,
      });
    });
  });

  it("[hover-overlay] positions card near target top-right instead of pinning to viewport top", async () => {
    appJotaiStore.set(engineeringWorkspaceModeAtom, "data");
    appJotaiStore.set(engineeringProjectDocumentAtom, createProjectDocument());
    appJotaiStore.set(componentCurveCatalogAtom, {
      curvesByType: {},
      loadStatusByType: {},
      errorsByType: {},
    });

    await render(<ExcalidrawApp />);

    await withExcalidrawDimensions({ width: 1920, height: 1080 }, async () => {
      const boiler = createEngineeringImage({
        id: "component:hover-overlay-position",
        name: "锅炉",
        componentType: "Boiler",
        x: 260,
        y: 500,
      });

      API.updateScene({
        elements: [boiler],
        captureUpdate: CaptureUpdateAction.NEVER,
      });
      API.clearSelection();
      API.setAppState({
        hoveredElementIds: {
          [boiler.id]: true,
        },
      });

      const card = await screen.findByTestId("engineering-hover-preview-card");
      const cardTop = Number.parseFloat(card.style.top || "0");
      const cardLeft = Number.parseFloat(card.style.left || "0");
      const targetViewportPoint = sceneCoordsToViewportCoords(
        {
          sceneX: boiler.x + boiler.width,
          sceneY: boiler.y,
        },
        window.h.state,
      );

      expect(cardLeft).toBeGreaterThan(targetViewportPoint.x);
      expect(cardTop).toBeGreaterThan(targetViewportPoint.y - 150);
      expect(cardTop).toBeLessThan(targetViewportPoint.y);
    });
  });

  it("puts table row/column operations under Actions tab and variable bindings under Data tab", async () => {
    appJotaiStore.set(engineeringWorkspaceModeAtom, "data");
    appJotaiStore.set(engineeringProjectDocumentAtom, createProjectDocument());
    appJotaiStore.set(componentCurveCatalogAtom, {
      curvesByType: {},
      loadStatusByType: {},
      errorsByType: {},
    });

    await render(<ExcalidrawApp />);

    await withExcalidrawDimensions({ width: 1920, height: 1080 }, async () => {
      const tableItem = createEngineeringTableMaterialLibraryItem();
      const tableElements = withTableTemplateAt({
        elements: tableItem.elements,
        row: 0,
        col: 0,
        template: "{{data[var:ambient].value}}",
      });
      const selectedCell = getTableCellAt(tableElements, 0, 0);
      if (!selectedCell) {
        throw new Error("missing table cell at 0:0");
      }

      API.updateScene({
        elements: tableElements,
        captureUpdate: CaptureUpdateAction.NEVER,
      });
      API.setSelectedElements([selectedCell]);

      const tablist = await screen.findByRole("tablist", {
        name: "Properties sections",
      });

      fireEvent.click(within(tablist).getByRole("tab", { name: /^Actions$/i }));

      await waitFor(() => {
        expect(screen.getByText("表格素材")).toBeVisible();
      });
      expect(screen.getByText(/当前尺寸：3 行 × 3 列/)).toBeVisible();

      fireEvent.click(screen.getByRole("button", { name: "+ 行" }));

      await waitFor(() => {
        expect(screen.getByText(/当前尺寸：4 行 × 3 列/)).toBeVisible();
      });

      fireEvent.click(within(tablist).getByRole("tab", { name: /^Data$/i }));

      await waitFor(() => {
        const dataPanel = screen.getByRole("tabpanel", { name: /^Data$/i });
        expect(within(dataPanel).getByText("var:ambient")).toBeVisible();
      });
    });
  });

  it("shows chart material actions for normal shape and persists config only after clicking apply", async () => {
    appJotaiStore.set(engineeringWorkspaceModeAtom, "data");
    appJotaiStore.set(engineeringProjectDocumentAtom, createProjectDocument());
    appJotaiStore.set(componentCurveCatalogAtom, {
      curvesByType: {},
      loadStatusByType: {},
      errorsByType: {},
    });

    await render(<ExcalidrawApp />);

    await withExcalidrawDimensions({ width: 1920, height: 1080 }, async () => {
      const lineChartItem = createEngineeringChartMaterialLibraryItems()[0];
      const chartElement = lineChartItem.elements[0];

      API.updateScene({
        elements: lineChartItem.elements,
        captureUpdate: CaptureUpdateAction.NEVER,
      });
      API.setSelectedElements([chartElement]);

      const tablist = await screen.findByRole("tablist", {
        name: "Properties sections",
      });
      fireEvent.click(within(tablist).getByRole("tab", { name: /^Actions$/i }));

      await waitFor(() => {
        expect(screen.getByText("图示素材")).toBeVisible();
      });

      const labelsInput = screen.getByLabelText("图示分类变量");
      const valuesInput = screen.getByLabelText("图示数值变量");

      fireEvent.change(labelsInput, {
        target: {
          value: '{{vars["plant.units.power.labels"]}}',
        },
      });
      fireEvent.change(valuesInput, {
        target: {
          value: '{{vars["plant.units.power.values"]}}',
        },
      });

      const beforeApply = API.getElement(chartElement);
      expect(
        (beforeApply?.customData as Record<string, any> | undefined)
          ?.engineeringChartMaterial?.bindings?.labels,
      ).not.toBe('{{vars["plant.units.power.labels"]}}');

      fireEvent.click(screen.getByRole("button", { name: "应用图示配置" }));

      await waitFor(() => {
        const nextChart = API.getElement(chartElement);
        expect(
          (nextChart?.customData as Record<string, any> | undefined)
            ?.engineeringChartMaterial?.bindings,
        ).toEqual({
          labels: '{{vars["plant.units.power.labels"]}}',
          values: '{{vars["plant.units.power.values"]}}',
        });
      });
    });
  });

  it("does not warn dotted alias bindings as missing after data feed is available", async () => {
    appJotaiStore.set(engineeringWorkspaceModeAtom, "data");
    appJotaiStore.set(engineeringProjectDocumentAtom, createProjectDocument());
    appJotaiStore.set(componentCurveCatalogAtom, {
      curvesByType: {},
      loadStatusByType: {},
      errorsByType: {},
    });

    await render(<ExcalidrawApp />);

    await withExcalidrawDimensions({ width: 1920, height: 1080 }, async () => {
      const lineChartItem = createEngineeringChartMaterialLibraryItems()[0];
      const chartElement = lineChartItem.elements[0];

      API.updateScene({
        elements: lineChartItem.elements,
        captureUpdate: CaptureUpdateAction.NEVER,
      });
      API.setSelectedElements([chartElement]);

      await act(async () => {
        publishEngineeringData([
          {
            id: "var:chart:unit-power:labels",
            alias: "plant.units.power.labels",
            value: "1号机,2号机,3号机",
          },
          {
            id: "var:chart:unit-power:values",
            alias: "plant.units.power.values",
            value: "630,615,642",
          },
        ]);
      });

      const tablist = await screen.findByRole("tablist", {
        name: "Properties sections",
      });
      fireEvent.click(within(tablist).getByRole("tab", { name: /^Actions$/i }));

      await waitFor(() => {
        expect(screen.getByText("图示素材")).toBeVisible();
      });

      fireEvent.change(screen.getByLabelText("图示分类变量"), {
        target: {
          value: '{{vars["plant.units.power.labels"]}}',
        },
      });
      fireEvent.change(screen.getByLabelText("图示数值变量"), {
        target: {
          value: '{{vars["plant.units.power.values"]}}',
        },
      });
      fireEvent.click(screen.getByRole("button", { name: "应用图示配置" }));

      await waitFor(() => {
        const nextChart = API.getElement(chartElement);
        const chartMeta = (nextChart?.customData as Record<string, any> | undefined)
          ?.engineeringChartMaterial;
        expect(chartMeta?.warnings || []).not.toContain(
          "变量不存在: plant.units.power.labels",
        );
        expect(chartMeta?.warnings || []).not.toContain(
          "变量不存在: plant.units.power.values",
        );
        expect(chartMeta?.lastGoodOption).toEqual(
          expect.objectContaining({
            series: [expect.objectContaining({ data: [630, 615, 642] })],
          }),
        );
      });

      await act(async () => {
        publishEngineeringData([]);
      });
    });
  });

  it("keeps chart code draft when data refresh updates snapshot metadata", async () => {
    appJotaiStore.set(engineeringWorkspaceModeAtom, "data");
    appJotaiStore.set(engineeringProjectDocumentAtom, createProjectDocument());
    appJotaiStore.set(componentCurveCatalogAtom, {
      curvesByType: {},
      loadStatusByType: {},
      errorsByType: {},
    });

    await render(<ExcalidrawApp />);

    await withExcalidrawDimensions({ width: 1920, height: 1080 }, async () => {
      const lineChartItem = createEngineeringChartMaterialLibraryItems()[0];
      const chartElement = lineChartItem.elements[0];

      API.updateScene({
        elements: lineChartItem.elements,
        captureUpdate: CaptureUpdateAction.NEVER,
      });
      API.setSelectedElements([chartElement]);

      const tablist = await screen.findByRole("tablist", {
        name: "Properties sections",
      });
      fireEvent.click(within(tablist).getByRole("tab", { name: /^Actions$/i }));

      await waitFor(() => {
        expect(screen.getByText("图示素材")).toBeVisible();
      });

      fireEvent.change(screen.getByLabelText("图示模式"), {
        target: { value: "code" },
      });

      const codeDraft =
        '(vars) => ({ title: { text: "未应用草稿" }, xAxis: { type: "category", data: ["A"] }, yAxis: { type: "value" }, series: [{ type: "line", data: [1] }] })';
      fireEvent.change(screen.getByLabelText("图示代码函数"), {
        target: { value: codeDraft },
      });

      expect(
        (screen.getByLabelText("图示模式") as HTMLSelectElement).value,
      ).toBe("code");
      expect(
        (screen.getByLabelText("图示代码函数") as HTMLTextAreaElement).value,
      ).toBe(codeDraft);

      await act(async () => {
        publishEngineeringData([
          {
            id: "var:chart:main-steam-pressure:labels",
            alias: "plant.boiler.mainSteamPressure.labels",
            value: "08:00,09:00,10:00",
          },
          {
            id: "var:chart:main-steam-pressure:values",
            alias: "plant.boiler.mainSteamPressure.values",
            value: "13.2,13.4,13.1",
          },
        ]);
      });

      await waitFor(
        () => {
          const nextChart = API.getElement(chartElement);
          const chartMeta = (nextChart?.customData as Record<string, any> | undefined)
            ?.engineeringChartMaterial;
          expect(chartMeta?.lastRenderImageDataURL).toMatch(/^data:image\/svg\+xml/);
        },
        {
          timeout: 3_000,
        },
      );

      expect(
        (screen.getByLabelText("图示模式") as HTMLSelectElement).value,
      ).toBe("code");
      expect(
        (screen.getByLabelText("图示代码函数") as HTMLTextAreaElement).value,
      ).toBe(codeDraft);

      await act(async () => {
        publishEngineeringData([]);
      });
    });
  });

  it("refreshes chart snapshot metadata from engineering data feed with debounce scheduling", async () => {
    appJotaiStore.set(engineeringWorkspaceModeAtom, "data");
    appJotaiStore.set(engineeringProjectDocumentAtom, createProjectDocument());
    appJotaiStore.set(componentCurveCatalogAtom, {
      curvesByType: {},
      loadStatusByType: {},
      errorsByType: {},
    });

    await render(<ExcalidrawApp />);

    await withExcalidrawDimensions({ width: 1920, height: 1080 }, async () => {
      const lineChartItem = createEngineeringChartMaterialLibraryItems()[0];
      const chartElement = lineChartItem.elements[0];

      API.updateScene({
        elements: lineChartItem.elements,
        captureUpdate: CaptureUpdateAction.NEVER,
      });
      API.setSelectedElements([chartElement]);

      const tablist = await screen.findByRole("tablist", {
        name: "Properties sections",
      });
      fireEvent.click(within(tablist).getByRole("tab", { name: /^Actions$/i }));

      fireEvent.change(screen.getByLabelText("图示分类变量"), {
        target: {
          value: '{{vars["chart.demo.labels"]}}',
        },
      });
      fireEvent.change(screen.getByLabelText("图示数值变量"), {
        target: {
          value: '{{vars["chart.demo.values"]}}',
        },
      });
      fireEvent.click(screen.getByRole("button", { name: "应用图示配置" }));

      await waitFor(() => {
        const nextChart = API.getElement(chartElement);
        expect(
          (nextChart?.customData as Record<string, any> | undefined)
            ?.engineeringChartMaterial?.bindings,
        ).toEqual({
          labels: '{{vars["chart.demo.labels"]}}',
          values: '{{vars["chart.demo.values"]}}',
        });
      });

      await act(async () => {
        publishEngineeringData([
          {
            id: "var:chart-demo-labels",
            alias: "chart.demo.labels",
            value: "1号机,2号机,3号机",
          },
          {
            id: "var:chart-demo-values",
            alias: "chart.demo.values",
            value: "630,615,642",
          },
        ]);
      });

      await waitFor(
        () => {
          const nextChart = API.getElement(chartElement);
          const chartMeta = (nextChart?.customData as Record<string, any> | undefined)
            ?.engineeringChartMaterial;
          expect(chartMeta?.lastGoodOption).toBeTruthy();
          expect(chartMeta?.lastGoodImageDataURL).toMatch(
            /^data:image\/svg\+xml/,
          );
        },
        {
          timeout: 3_000,
        },
      );

      await act(async () => {
        publishEngineeringData([]);
      });
    });
  });

  it("groups input parameters by group in the input tab", async () => {
    appJotaiStore.set(engineeringWorkspaceModeAtom, "data");
    appJotaiStore.set(engineeringProjectDocumentAtom, createProjectDocument());
    appJotaiStore.set(componentCurveCatalogAtom, {
      curvesByType: {},
      loadStatusByType: {},
      errorsByType: {},
    });

    await render(<ExcalidrawApp />);

    await withExcalidrawDimensions({ width: 1920, height: 1080 }, async () => {
      const boiler = createEngineeringImage({
        id: "component:boiler",
        name: "锅炉",
        componentType: "Boiler",
      });

      API.updateScene({
        elements: [boiler],
        captureUpdate: CaptureUpdateAction.NEVER,
      });
      API.setSelectedElements([boiler]);

      fireEvent.click(screen.getByRole("tab", { name: /^Input$/i }));

      const inputPanel = await screen.findByRole("tabpanel", {
        name: /^Input$/i,
      });

      await waitFor(() => {
        expect(
          within(inputPanel).getByText("机械不完全燃烧损失"),
        ).toBeVisible();
      });
      expect(within(inputPanel).getByText("基本")).toBeVisible();
      expect(within(inputPanel).getByText("汽水")).toBeVisible();
      expect(within(inputPanel).getByText("烟风")).toBeVisible();
    });
  });

  it("renders output without sensor column and keeps anchor material data in anchors tab", async () => {
    appJotaiStore.set(engineeringWorkspaceModeAtom, "data");
    appJotaiStore.set(engineeringProjectDocumentAtom, createProjectDocument());
    appJotaiStore.set(componentCurveCatalogAtom, {
      curvesByType: {},
      loadStatusByType: {},
      errorsByType: {},
    });

    await render(<ExcalidrawApp />);

    await withExcalidrawDimensions({ width: 1920, height: 1080 }, async () => {
      const boiler = createEngineeringImage({
        id: "component:boiler",
        name: "锅炉",
        componentType: "Boiler",
        anchors: [
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
              name_cn: "",
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
      });

      API.updateScene({
        elements: [boiler],
        captureUpdate: CaptureUpdateAction.NEVER,
      });
      API.setSelectedElements([boiler]);

      fireEvent.click(screen.getByRole("tab", { name: /^Output$/i }));

      const outputPanel = await screen.findByRole("tabpanel", {
        name: /^Output$/i,
      });

      await waitFor(() => {
        expect(within(outputPanel).getByText("锅炉热负荷")).toBeVisible();
      });

      expect(within(outputPanel).queryByText("测点")).not.toBeInTheDocument();
      expect(within(outputPanel).queryByText("入口")).not.toBeInTheDocument();
      expect(within(outputPanel).queryByText("Outlet")).not.toBeInTheDocument();

      fireEvent.click(screen.getByRole("tab", { name: /^Anchors$/i }));

      const anchorsPanel = await screen.findByRole("tabpanel", {
        name: /^Anchors$/i,
      });

      expect(within(anchorsPanel).getByText("入口")).toBeVisible();
      expect(within(anchorsPanel).getByText("water")).toBeVisible();
      expect(within(anchorsPanel).getByText("Outlet")).toBeVisible();
      expect(within(anchorsPanel).getByText("gas")).toBeVisible();
      await waitFor(() => {
        expect(within(anchorsPanel).getByText("干度")).toBeVisible();
      });
      expect(within(anchorsPanel).getByText("相对湿度")).toBeVisible();
    });
  });

  it("[anchor-sync] forces anchors tab in data mode and scopes anchors panel to the selected anchor point", async () => {
    appJotaiStore.set(engineeringWorkspaceModeAtom, "data");
    appJotaiStore.set(engineeringProjectDocumentAtom, createProjectDocument());
    appJotaiStore.set(componentCurveCatalogAtom, {
      curvesByType: {},
      loadStatusByType: {},
      errorsByType: {},
    });

    await render(<ExcalidrawApp />);

    await withExcalidrawDimensions({ width: 1920, height: 1080 }, async () => {
      const boiler = createEngineeringImage({
        id: "component:boiler",
        name: "锅炉",
        componentType: "Boiler",
        anchors: [
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
              name_cn: "",
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
      });

      API.updateScene({
        elements: [boiler],
        captureUpdate: CaptureUpdateAction.NEVER,
      });
      API.setSelectedElements([boiler]);

      fireEvent.click(screen.getByRole("tab", { name: /^Input$/i }));
      await waitFor(() => {
        expect(screen.getByRole("tab", { name: /^Input$/i })).toHaveAttribute(
          "aria-selected",
          "true",
        );
      });

      API.setAppState({
        selectedAnchorPointIndex: 1,
      });

      await waitFor(() => {
        expect(screen.getByRole("tab", { name: /^Anchors$/i })).toHaveAttribute(
          "aria-selected",
          "true",
        );
      });

      const anchorsPanel = await screen.findByRole("tabpanel", {
        name: /^Anchors$/i,
      });

      await waitFor(() => {
        expect(within(anchorsPanel).getByText("Outlet")).toBeVisible();
      });
      expect(within(anchorsPanel).getByText("gas")).toBeVisible();
      expect(within(anchorsPanel).queryByText("入口")).not.toBeInTheDocument();
      expect(within(anchorsPanel).queryByText("water")).not.toBeInTheDocument();
    });
  });

  it("[anchor-sync] clicks canvas anchor point and switches to anchors tab with nearest anchor output", async () => {
    appJotaiStore.set(engineeringWorkspaceModeAtom, "data");
    appJotaiStore.set(engineeringProjectDocumentAtom, createProjectDocument());
    appJotaiStore.set(componentCurveCatalogAtom, {
      curvesByType: {},
      loadStatusByType: {},
      errorsByType: {},
    });

    await render(<ExcalidrawApp />);

    await withExcalidrawDimensions({ width: 1920, height: 1080 }, async () => {
      const boiler = createEngineeringImage({
        id: "component:boiler",
        name: "锅炉",
        componentType: "Boiler",
        anchors: [
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
              name_cn: "",
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
      });

      API.updateScene({
        elements: [boiler],
        captureUpdate: CaptureUpdateAction.NEVER,
      });
      API.setSelectedElements([boiler]);

      fireEvent.click(screen.getByRole("tab", { name: /^Input$/i }));
      await waitFor(() => {
        expect(screen.getByRole("tab", { name: /^Input$/i })).toHaveAttribute(
          "aria-selected",
          "true",
        );
      });

      const anchorSceneX = boiler.x + boiler.width;
      const anchorSceneY = boiler.y + boiler.height * 0.5;
      const anchorViewport = sceneCoordsToViewportCoords(
        { sceneX: anchorSceneX, sceneY: anchorSceneY },
        window.h.state,
      );

      mouse.clickAt(anchorViewport.x, anchorViewport.y);

      await waitFor(() => {
        expect(screen.getByRole("tab", { name: /^Anchors$/i })).toHaveAttribute(
          "aria-selected",
          "true",
        );
      });

      const anchorsPanel = await screen.findByRole("tabpanel", {
        name: /^Anchors$/i,
      });

      await waitFor(() => {
        expect(within(anchorsPanel).getByText("Outlet")).toBeVisible();
      });
      expect(within(anchorsPanel).queryByText("入口")).not.toBeInTheDocument();
      expect(within(anchorsPanel).getByText("gas")).toBeVisible();
    });
  });

  it("[anchor-sync] treats selected pipe endpoint as anchor selection and jumps to the bound anchor tab content", async () => {
    appJotaiStore.set(engineeringWorkspaceModeAtom, "data");
    appJotaiStore.set(engineeringProjectDocumentAtom, createProjectDocument());
    appJotaiStore.set(componentCurveCatalogAtom, {
      curvesByType: {},
      loadStatusByType: {},
      errorsByType: {},
    });

    await render(<ExcalidrawApp />);

    await withExcalidrawDimensions({ width: 1920, height: 1080 }, async () => {
      const source = createEngineeringImage({
        id: "component:source",
        name: "源组件",
        componentType: "Boiler",
        anchors: [
          {
            id: "source-in",
            uuid: "source-in",
            node_id: "source-node-in",
            position: { x: 0, y: 0.5 },
            data: {
              name: "Source-In",
              name_cn: "",
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
            id: "source-out",
            uuid: "source-out",
            node_id: "source-node-out",
            position: { x: 1, y: 0.5 },
            data: {
              name: "Source-Out",
              name_cn: "",
              interface_type: "Outlet",
              connection_type: "outlet",
              is_connected: false,
              is_visible: true,
              allow_not_display: false,
              material_type: "steam",
              tpis_extra_info: null,
            },
          },
        ],
      });
      const sink = createEngineeringImage({
        id: "component:sink",
        name: "汇组件",
        componentType: "Boiler",
        anchors: [
          {
            id: "sink-in",
            uuid: "sink-in",
            node_id: "sink-node-in",
            position: { x: 0, y: 0.5 },
            data: {
              name: "Sink-In",
              name_cn: "",
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
            id: "sink-out",
            uuid: "sink-out",
            node_id: "sink-node-out",
            position: { x: 1, y: 0.5 },
            data: {
              name: "Sink-Out",
              name_cn: "",
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
      });
      const pipe = API.createElement({
        id: "arrow:pipe-1",
        type: "arrow",
        x: 0,
        y: 0,
        width: 300,
        height: 0,
        points: [
          pointFrom(0, 0),
          pointFrom(300, 0),
        ],
        startBinding: {
          elementId: source.id,
          fixedPoint: [1, 0.5],
          mode: "orbit",
        },
        endBinding: {
          elementId: sink.id,
          fixedPoint: [0, 0.5],
          mode: "orbit",
        },
      });

      API.updateScene({
        elements: [source, sink, pipe],
        captureUpdate: CaptureUpdateAction.NEVER,
      });
      API.setSelectedElements([pipe]);

      const selectedLinearElement = (window as any).h.state.selectedLinearElement;

      API.setAppState({
        selectedLinearElement: {
          ...(selectedLinearElement || {
            elementId: pipe.id,
          }),
          selectedPointsIndices: [0],
          isEditing: true,
        } as any,
      });

      await waitFor(() => {
        expect(screen.getByRole("tab", { name: /^Anchors$/i })).toHaveAttribute(
          "aria-selected",
          "true",
        );
      });

      const anchorsPanel = await screen.findByRole("tabpanel", {
        name: /^Anchors$/i,
      });

      await waitFor(() => {
        expect(within(anchorsPanel).getByText("Source-Out")).toBeVisible();
      });
      expect(within(anchorsPanel).queryByText("Sink-In")).not.toBeInTheDocument();
      expect(within(anchorsPanel).getByText("steam")).toBeVisible();
    });
  });

  it("[anchor-sync] ignores selected anchor point when multiple components are selected", async () => {
    appJotaiStore.set(engineeringWorkspaceModeAtom, "data");
    appJotaiStore.set(engineeringProjectDocumentAtom, createProjectDocument());
    appJotaiStore.set(componentCurveCatalogAtom, {
      curvesByType: {},
      loadStatusByType: {},
      errorsByType: {},
    });

    await render(<ExcalidrawApp />);

    await withExcalidrawDimensions({ width: 1920, height: 1080 }, async () => {
      const boilerA = createEngineeringImage({
        id: "component:boiler-a",
        name: "锅炉A",
        componentType: "Boiler",
      });
      const boilerB = createEngineeringImage({
        id: "component:boiler-b",
        name: "锅炉B",
        componentType: "Boiler",
      });

      API.updateScene({
        elements: [boilerA, boilerB],
        captureUpdate: CaptureUpdateAction.NEVER,
      });
      API.setSelectedElements([boilerA, boilerB]);

      fireEvent.click(screen.getByRole("tab", { name: /^Output$/i }));
      await waitFor(() => {
        expect(screen.getByRole("tab", { name: /^Output$/i })).toHaveAttribute(
          "aria-selected",
          "true",
        );
      });

      API.setAppState({
        selectedAnchorPointIndex: 0,
      });

      await waitFor(() => {
        expect(screen.getByRole("tab", { name: /^Output$/i })).toHaveAttribute(
          "aria-selected",
          "true",
        );
      });
      expect(screen.getByRole("tab", { name: /^Anchors$/i })).toHaveAttribute(
        "aria-selected",
        "false",
      );
    });
  });

  it("[anchor-sync] treats structure tree anchor node click as anchor selection and jumps to anchors tab", async () => {
    appJotaiStore.set(engineeringWorkspaceModeAtom, "data");
    appJotaiStore.set(engineeringProjectDocumentAtom, createProjectDocument());
    appJotaiStore.set(componentCurveCatalogAtom, {
      curvesByType: {},
      loadStatusByType: {},
      errorsByType: {},
    });

    await render(<ExcalidrawApp />);

    await withExcalidrawDimensions({ width: 1920, height: 1080 }, async () => {
      const boiler = createEngineeringImage({
        id: "component:boiler",
        name: "锅炉",
        componentType: "Boiler",
        anchors: [
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
              name_cn: "",
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
      });

      API.updateScene({
        elements: [boiler],
        captureUpdate: CaptureUpdateAction.NEVER,
      });
      API.setSelectedElements([boiler]);
      API.setAppState({
        openSidebar: {
          name: "default",
          tab: "engineering-structure",
        },
      });

      await waitFor(() => {
        expect(screen.getByTestId("engineering-structure-tree")).toBeVisible();
      });

      let componentNodeTestId = "";
      let anchorNodeTestId = "";
      await waitFor(() => {
        const project = appJotaiStore.get(engineeringProjectDocumentAtom);
        const componentEntity = Object.values(project.topology.componentsById).find(
          (component) =>
            (component.props.elementId === boiler.id ||
              (Array.isArray(component.props.elementIds) &&
                component.props.elementIds.includes(boiler.id))) &&
            component.templateKey === "Boiler",
        );

        expect(componentEntity).toBeDefined();
        expect(componentEntity!.anchorIds.length).toBeGreaterThan(1);
        componentNodeTestId = `engineering-structure-node-${componentEntity!.id}`;
        anchorNodeTestId = `engineering-structure-node-${componentEntity!.anchorIds[1]}`;
      });

      fireEvent.click(screen.getByTestId(componentNodeTestId));
      await waitFor(() => {
        expect(screen.getByTestId(anchorNodeTestId)).toBeVisible();
      });

      fireEvent.click(screen.getByTestId(anchorNodeTestId));

      await waitFor(() => {
        expect(screen.getByRole("tab", { name: /^Anchors$/i })).toHaveAttribute(
          "aria-selected",
          "true",
        );
      });

      const anchorsPanel = await screen.findByRole("tabpanel", {
        name: /^Anchors$/i,
      });
      await waitFor(() => {
        expect(within(anchorsPanel).getByText("Outlet")).toBeVisible();
      });
      expect(within(anchorsPanel).queryByText("入口")).not.toBeInTheDocument();
      expect(within(anchorsPanel).getByText("gas")).toBeVisible();
    });
  });

  it("[structure-tree] keeps anchors collapsed by default and allows only one component anchors section expanded", async () => {
    appJotaiStore.set(engineeringWorkspaceModeAtom, "data");
    appJotaiStore.set(engineeringProjectDocumentAtom, createProjectDocument());
    appJotaiStore.set(componentCurveCatalogAtom, {
      curvesByType: {},
      loadStatusByType: {},
      errorsByType: {},
    });

    await render(<ExcalidrawApp />);

    await withExcalidrawDimensions({ width: 1920, height: 1080 }, async () => {
      const boilerA = createEngineeringImage({
        id: "component:boiler-a",
        name: "锅炉A",
        componentType: "Boiler",
      });
      const boilerB = createEngineeringImage({
        id: "component:boiler-b",
        name: "锅炉B",
        componentType: "Boiler",
      });

      API.updateScene({
        elements: [boilerA, boilerB],
        captureUpdate: CaptureUpdateAction.NEVER,
      });
      API.setSelectedElements([boilerA]);
      API.setAppState({
        openSidebar: {
          name: "default",
          tab: "engineering-structure",
        },
      });

      await waitFor(() => {
        expect(screen.getByTestId("engineering-structure-tree")).toBeVisible();
      });

      let componentNodeATestId = "";
      let componentNodeBTestId = "";
      let anchorNodeAInletTestId = "";
      let anchorNodeBInletTestId = "";
      await waitFor(() => {
        const project = appJotaiStore.get(engineeringProjectDocumentAtom);
        const findComponentEntity = (elementId: string) =>
          Object.values(project.topology.componentsById).find(
            (component) =>
              (component.props.elementId === elementId ||
                (Array.isArray(component.props.elementIds) &&
                  component.props.elementIds.includes(elementId))) &&
              component.templateKey === "Boiler",
          );

        const componentA = findComponentEntity(boilerA.id);
        const componentB = findComponentEntity(boilerB.id);
        expect(componentA).toBeDefined();
        expect(componentB).toBeDefined();
        expect(componentA!.anchorIds.length).toBeGreaterThan(0);
        expect(componentB!.anchorIds.length).toBeGreaterThan(0);

        componentNodeATestId = `engineering-structure-node-${componentA!.id}`;
        componentNodeBTestId = `engineering-structure-node-${componentB!.id}`;
        anchorNodeAInletTestId = `engineering-structure-node-${componentA!.anchorIds[0]}`;
        anchorNodeBInletTestId = `engineering-structure-node-${componentB!.anchorIds[0]}`;
      });

      expect(screen.queryByTestId(anchorNodeAInletTestId)).not.toBeInTheDocument();
      expect(screen.queryByTestId(anchorNodeBInletTestId)).not.toBeInTheDocument();

      fireEvent.click(screen.getByTestId(componentNodeATestId));
      await waitFor(() => {
        expect(screen.getByTestId(anchorNodeAInletTestId)).toBeVisible();
      });
      expect(screen.queryByTestId(anchorNodeBInletTestId)).not.toBeInTheDocument();

      fireEvent.click(screen.getByTestId(componentNodeBTestId));
      await waitFor(() => {
        expect(screen.getByTestId(anchorNodeBInletTestId)).toBeVisible();
      });
      expect(screen.queryByTestId(anchorNodeAInletTestId)).not.toBeInTheDocument();
    });
  });

  it("[structure-tree] auto-expands the component when its anchor is selected", async () => {
    appJotaiStore.set(engineeringWorkspaceModeAtom, "data");
    appJotaiStore.set(engineeringProjectDocumentAtom, createProjectDocument());
    appJotaiStore.set(componentCurveCatalogAtom, {
      curvesByType: {},
      loadStatusByType: {},
      errorsByType: {},
    });

    await render(<ExcalidrawApp />);

    await withExcalidrawDimensions({ width: 1920, height: 1080 }, async () => {
      const boilerA = createEngineeringImage({
        id: "component:boiler-a",
        name: "锅炉A",
        componentType: "Boiler",
      });
      const boilerB = createEngineeringImage({
        id: "component:boiler-b",
        name: "锅炉B",
        componentType: "Boiler",
      });

      API.updateScene({
        elements: [boilerA, boilerB],
        captureUpdate: CaptureUpdateAction.NEVER,
      });
      API.setSelectedElements([boilerB]);
      API.setAppState({
        openSidebar: {
          name: "default",
          tab: "engineering-structure",
        },
      });

      await waitFor(() => {
        expect(screen.getByTestId("engineering-structure-tree")).toBeVisible();
      });

      let anchorNodeAInletTestId = "";
      let anchorNodeBInletTestId = "";
      await waitFor(() => {
        const project = appJotaiStore.get(engineeringProjectDocumentAtom);
        const findComponentEntity = (elementId: string) =>
          Object.values(project.topology.componentsById).find(
            (component) =>
              (component.props.elementId === elementId ||
                (Array.isArray(component.props.elementIds) &&
                  component.props.elementIds.includes(elementId))) &&
              component.templateKey === "Boiler",
          );

        const componentA = findComponentEntity(boilerA.id);
        const componentB = findComponentEntity(boilerB.id);
        expect(componentA).toBeDefined();
        expect(componentB).toBeDefined();
        expect(componentA!.anchorIds.length).toBeGreaterThan(0);
        expect(componentB!.anchorIds.length).toBeGreaterThan(0);

        anchorNodeAInletTestId = `engineering-structure-node-${componentA!.anchorIds[0]}`;
        anchorNodeBInletTestId = `engineering-structure-node-${componentB!.anchorIds[0]}`;
      });

      expect(screen.queryByTestId(anchorNodeAInletTestId)).not.toBeInTheDocument();
      expect(screen.queryByTestId(anchorNodeBInletTestId)).not.toBeInTheDocument();

      API.setAppState({
        selectedAnchorPointIndex: 0,
      });

      await waitFor(() => {
        expect(screen.getByTestId(anchorNodeBInletTestId)).toBeVisible();
      });
      expect(screen.queryByTestId(anchorNodeAInletTestId)).not.toBeInTheDocument();
    });
  });

  it("exposes sensor binding entry and opens the curve panel placeholder in input tab", async () => {
    appJotaiStore.set(engineeringWorkspaceModeAtom, "data");
    appJotaiStore.set(engineeringProjectDocumentAtom, createProjectDocument());
    appJotaiStore.set(componentCurveCatalogAtom, {
      curvesByType: {},
      loadStatusByType: {},
      errorsByType: {},
    });

    await render(<ExcalidrawApp />);

    await withExcalidrawDimensions({ width: 1920, height: 1080 }, async () => {
      const boiler = createEngineeringImage({
        id: "component:boiler",
        name: "锅炉",
        componentType: "Boiler",
      });

      API.updateScene({
        elements: [boiler],
        captureUpdate: CaptureUpdateAction.NEVER,
      });
      API.setSelectedElements([boiler]);

      fireEvent.click(screen.getByRole("tab", { name: /^Input$/i }));

      await waitFor(() => {
        expect(screen.getByRole("button", { name: "绑定测点-锅炉效率" })).toBeVisible();
      });

      fireEvent.click(screen.getByRole("button", { name: "绑定测点-锅炉效率" }));

      await waitFor(() => {
        expect(screen.getByText("测点绑定（占位）")).toBeVisible();
      });
      expect(screen.getByText("当前参数：锅炉效率")).toBeVisible();

      fireEvent.click(screen.getByRole("button", { name: "关闭绑定面板" }));
      expect(screen.queryByText("测点绑定（占位）")).not.toBeInTheDocument();

      expect(appJotaiStore.get(componentCurveCatalogAtom).curvesByType.Boiler).toBeUndefined();

      fireEvent.click(
        screen.getByRole("button", { name: "打开曲线面板-主流量-主汽压降" }),
      );

      await waitFor(() => {
        expect(screen.getByText("曲线面板（占位）")).toBeVisible();
      });
      expect(screen.getByText("当前参数：主流量-主汽压降")).toBeVisible();

      await waitFor(() => {
        expect(
          appJotaiStore.get(componentCurveCatalogAtom).loadStatusByType.Boiler,
        ).toBe("ready");
      });
    });
  });

  it("persists sensor binding config into scenario pointBindings from the binding panel", async () => {
    appJotaiStore.set(engineeringWorkspaceModeAtom, "data");
    appJotaiStore.set(engineeringProjectDocumentAtom, createProjectDocument());
    appJotaiStore.set(componentCurveCatalogAtom, {
      curvesByType: {},
      loadStatusByType: {},
      errorsByType: {},
    });

    await render(<ExcalidrawApp />);

    await withExcalidrawDimensions({ width: 1920, height: 1080 }, async () => {
      const boiler = createEngineeringImage({
        id: "component:boiler",
        name: "锅炉",
        componentType: "Boiler",
      });

      API.updateScene({
        elements: [boiler],
        captureUpdate: CaptureUpdateAction.NEVER,
      });
      API.setSelectedElements([boiler]);

      fireEvent.click(screen.getByRole("tab", { name: /^Input$/i }));
      fireEvent.click(screen.getByRole("button", { name: "绑定测点-锅炉效率" }));

      const measurementInput = await screen.findByLabelText("measurement-input");
      const pointNameInput = screen.getByLabelText("point-name-input");
      const fieldInput = screen.getByLabelText("field-input");

      fireEvent.change(measurementInput, {
        target: {
          value: "ambient.temperature",
        },
      });
      fireEvent.change(pointNameInput, {
        target: {
          value: "sensor.ambient.t",
        },
      });
      fireEvent.change(fieldInput, {
        target: {
          value: "value",
        },
      });
      fireEvent.click(screen.getByRole("button", { name: "保存绑定" }));

      await waitFor(() => {
        const scenario = appJotaiStore.get(engineeringScenarioDocumentAtom);
        const pointBinding = Object.values(scenario.pointBindings || {})[0];
        expect(pointBinding).toMatchObject({
          measurement: "ambient.temperature",
          pointName: "sensor.ambient.t",
          field: "value",
        });
      });
    });
  });

  it("renders the input panel as a list with stable columns and keeps string fields editable via text input", async () => {
    appJotaiStore.set(engineeringWorkspaceModeAtom, "data");
    appJotaiStore.set(engineeringProjectDocumentAtom, createProjectDocument());
    appJotaiStore.set(componentCurveCatalogAtom, {
      curvesByType: {},
      loadStatusByType: {},
      errorsByType: {},
    });

    await render(<ExcalidrawApp />);

    await withExcalidrawDimensions({ width: 1920, height: 1080 }, async () => {
      const boiler = createEngineeringImage({
        id: "component:boiler",
        name: "锅炉",
        componentType: "Boiler",
      });

      API.updateScene({
        elements: [boiler],
        captureUpdate: CaptureUpdateAction.NEVER,
      });
      API.setSelectedElements([boiler]);

      fireEvent.click(screen.getByRole("tab", { name: /^Input$/i }));

      const inputPanel = await screen.findByRole("tabpanel", {
        name: /^Input$/i,
      });

      expect(within(inputPanel).getByText("属性名")).toBeVisible();
      expect(within(inputPanel).getByText("值")).toBeVisible();
      expect(within(inputPanel).getByText("单位")).toBeVisible();
      expect(within(inputPanel).getByText("测点")).toBeVisible();
      expect(
        within(inputPanel).queryAllByText(/frontend_manual_input/i),
      ).toHaveLength(0);
      expect(within(inputPanel).queryAllByText("绑定测点")).toHaveLength(0);
      expect(
        within(inputPanel).getByRole("button", { name: "绑定测点-锅炉效率" }),
      ).toBeVisible();

      const textInputs = within(inputPanel).getAllByRole("textbox");
      expect(textInputs.length).toBeGreaterThan(0);
    });
  });

  it("keeps the active data tab when switching selected components", async () => {
    appJotaiStore.set(engineeringWorkspaceModeAtom, "data");
    appJotaiStore.set(engineeringProjectDocumentAtom, createProjectDocument());
    appJotaiStore.set(componentCurveCatalogAtom, {
      curvesByType: {},
      loadStatusByType: {},
      errorsByType: {},
    });

    await render(<ExcalidrawApp />);

    await withExcalidrawDimensions({ width: 1920, height: 1080 }, async () => {
      const boilerA = createEngineeringImage({
        id: "component:boiler-a",
        name: "锅炉A",
        componentType: "Boiler",
      });
      const boilerB = createEngineeringImage({
        id: "component:boiler-b",
        name: "锅炉B",
        componentType: "Boiler",
      });

      API.updateScene({
        elements: [boilerA, boilerB],
        captureUpdate: CaptureUpdateAction.NEVER,
      });

      API.setSelectedElements([boilerA]);
      fireEvent.click(screen.getByRole("tab", { name: /^Input$/i }));

      await waitFor(() => {
        expect(screen.getByRole("tab", { name: /^Input$/i })).toHaveAttribute(
          "aria-selected",
          "true",
        );
      });

      API.setSelectedElements([boilerB]);

      await waitFor(() => {
        expect(screen.getByRole("tab", { name: /^Input$/i })).toHaveAttribute(
          "aria-selected",
          "true",
        );
      });
      expect(
        screen.getByRole("tabpanel", { name: /^Input$/i }),
      ).toBeVisible();
    });
  });

  it("keeps the active data tab when leaving data workspace and returning", async () => {
    appJotaiStore.set(engineeringWorkspaceModeAtom, "data");
    appJotaiStore.set(engineeringProjectDocumentAtom, createProjectDocument());
    appJotaiStore.set(componentCurveCatalogAtom, {
      curvesByType: {},
      loadStatusByType: {},
      errorsByType: {},
    });

    await render(<ExcalidrawApp />);

    await withExcalidrawDimensions({ width: 1920, height: 1080 }, async () => {
      const container = document.querySelector(".excalidraw-container");
      expect(container).toBeTruthy();
      expect(
        (container as HTMLElement).style.getPropertyValue("--right-sidebar-width"),
      ).toBe("302px");

      const boiler = createEngineeringImage({
        id: "component:boiler",
        name: "锅炉",
        componentType: "Boiler",
      });

      API.updateScene({
        elements: [boiler],
        captureUpdate: CaptureUpdateAction.NEVER,
      });
      API.setSelectedElements([boiler]);

      fireEvent.click(screen.getByRole("tab", { name: /^Input$/i }));

      await waitFor(() => {
        expect(screen.getByRole("tab", { name: /^Input$/i })).toHaveAttribute(
          "aria-selected",
          "true",
        );
      });

      await act(async () => {
        appJotaiStore.set(engineeringWorkspaceModeAtom, "modeling");
      });
      await waitFor(() => {
        expect(
          screen.queryByRole("tablist", { name: "Properties sections" }),
        ).not.toBeInTheDocument();
      });

      await act(async () => {
        appJotaiStore.set(engineeringWorkspaceModeAtom, "analysis");
      });
      await waitFor(() => {
        expect(
          screen.queryByRole("tablist", { name: "Properties sections" }),
        ).not.toBeInTheDocument();
      });

      await act(async () => {
        appJotaiStore.set(engineeringWorkspaceModeAtom, "data");
      });
      await waitFor(() => {
        expect(screen.getByRole("tab", { name: /^Input$/i })).toHaveAttribute(
          "aria-selected",
          "true",
        );
      });
    });
  });

  it("keeps the active data tab after deselecting and selecting a component again", async () => {
    appJotaiStore.set(engineeringWorkspaceModeAtom, "data");
    appJotaiStore.set(engineeringProjectDocumentAtom, createProjectDocument());
    appJotaiStore.set(componentCurveCatalogAtom, {
      curvesByType: {},
      loadStatusByType: {},
      errorsByType: {},
    });

    await render(<ExcalidrawApp />);

    await withExcalidrawDimensions({ width: 1920, height: 1080 }, async () => {
      const boiler = createEngineeringImage({
        id: "component:boiler",
        name: "锅炉",
        componentType: "Boiler",
      });

      API.updateScene({
        elements: [boiler],
        captureUpdate: CaptureUpdateAction.NEVER,
      });
      API.setSelectedElements([boiler]);

      fireEvent.click(screen.getByRole("tab", { name: /^Input$/i }));
      await waitFor(() => {
        expect(screen.getByRole("tab", { name: /^Input$/i })).toHaveAttribute(
          "aria-selected",
          "true",
        );
      });

      API.setSelectedElements([]);
      await waitFor(() => {
        expect(
          screen.queryByRole("tablist", { name: "Properties sections" }),
        ).not.toBeInTheDocument();
      });

      API.setSelectedElements([boiler]);
      await waitFor(() => {
        expect(screen.getByRole("tab", { name: /^Input$/i })).toHaveAttribute(
          "aria-selected",
          "true",
        );
      });
    });
  });

  it("supports desktop resize with clamping and persists width per workspace mode", async () => {
    appJotaiStore.set(engineeringWorkspaceModeAtom, "data");
    appJotaiStore.set(engineeringProjectDocumentAtom, createProjectDocument());
    appJotaiStore.set(componentCurveCatalogAtom, {
      curvesByType: {},
      loadStatusByType: {},
      errorsByType: {},
    });

    await render(<ExcalidrawApp />);

    await withExcalidrawDimensions({ width: 1920, height: 1080 }, async () => {
      const boiler = createEngineeringImage({
        id: "component:boiler",
        name: "锅炉",
        componentType: "Boiler",
      });

      API.updateScene({
        elements: [boiler],
        captureUpdate: CaptureUpdateAction.NEVER,
      });
      API.setSelectedElements([boiler]);

      const getPanelContainer = () =>
        document.querySelector(".selected-shape-actions-container") as HTMLElement;

      const resizeHandle = await screen.findByRole("separator", {
        name: "调整属性栏宽度",
      });

      fireEvent.pointerDown(resizeHandle, { clientX: 1000 });
      fireEvent.pointerMove(window, { clientX: 100 });
      fireEvent.pointerUp(window);

      await waitFor(() => {
        expect(getPanelContainer().style.width).toBe("560px");
      });

      fireEvent.pointerDown(resizeHandle, { clientX: 1000 });
      fireEvent.pointerMove(window, { clientX: 1800 });
      fireEvent.pointerUp(window);

      await waitFor(() => {
        expect(getPanelContainer().style.width).toBe("280px");
      });

      const storedAfterDataResize = JSON.parse(
        window.localStorage.getItem(PANEL_WIDTH_STORAGE_KEY) || "{}",
      );
      expect(storedAfterDataResize.data).toBe(280);

      await act(async () => {
        appJotaiStore.set(engineeringWorkspaceModeAtom, "modeling");
      });

      await waitFor(() => {
        expect(getPanelContainer().style.width).toBe("302px");
      });

      const modelingHandle = await screen.findByRole("separator", {
        name: "调整属性栏宽度",
      });
      fireEvent.pointerDown(modelingHandle, { clientX: 1000 });
      fireEvent.pointerMove(window, { clientX: 920 });
      fireEvent.pointerUp(window);

      await waitFor(() => {
        expect(getPanelContainer().style.width).toBe("382px");
      });

      await act(async () => {
        appJotaiStore.set(engineeringWorkspaceModeAtom, "data");
      });
      await waitFor(() => {
        expect(getPanelContainer().style.width).toBe("280px");
      });

      await act(async () => {
        appJotaiStore.set(engineeringWorkspaceModeAtom, "modeling");
      });
      await waitFor(() => {
        expect(getPanelContainer().style.width).toBe("382px");
      });
    });
  });

  it("persists edited component input values into scenario.manualInputs by variable id", async () => {
    appJotaiStore.set(engineeringWorkspaceModeAtom, "data");
    appJotaiStore.set(engineeringProjectDocumentAtom, createProjectDocument());
    appJotaiStore.set(componentCurveCatalogAtom, {
      curvesByType: {},
      loadStatusByType: {},
      errorsByType: {},
    });

    await render(<ExcalidrawApp />);

    await withExcalidrawDimensions({ width: 1920, height: 1080 }, async () => {
      const boiler = createEngineeringImage({
        id: "component:boiler",
        name: "锅炉",
        componentType: "Boiler",
      });

      API.updateScene({
        elements: [boiler],
        captureUpdate: CaptureUpdateAction.NEVER,
      });
      API.setSelectedElements([boiler]);

      fireEvent.click(screen.getByRole("tab", { name: /^Input$/i }));

      const nameInput = await screen.findByLabelText("参数输入-Boiler-Name");
      fireEvent.change(nameInput, {
        target: {
          value: "锅炉A",
        },
      });

      await waitFor(() => {
        const scenario = appJotaiStore.get(engineeringScenarioDocumentAtom);
        expect(Object.keys(scenario.manualInputs).length).toBeGreaterThan(0);
      });

      const project = appJotaiStore.get(engineeringProjectDocumentAtom);
      const scenario = appJotaiStore.get(engineeringScenarioDocumentAtom);
      const componentEntity = Object.values(project.topology.componentsById).find(
        (component) =>
          (component.props.elementId === boiler.id ||
            (Array.isArray(component.props.elementIds) &&
              component.props.elementIds.includes(boiler.id))) &&
          component.templateKey === "Boiler",
      );

      expect(componentEntity).toBeDefined();

      const nameVariable = Object.values(project.variableCatalog.variablesById).find(
        (variable) =>
          variable.owner.kind === "component" &&
          variable.owner.id === componentEntity!.id &&
          variable.backend?.tpisKey === "Name",
      );

      expect(nameVariable).toBeDefined();

      const providerIds =
        project.variableCatalog.providerIdsByVariableId[nameVariable!.id] || [];
      const manualProviderId = providerIds.find(
        (providerId) =>
          project.variableCatalog.providersById[providerId]?.kind === "manual",
      );

      expect(scenario.manualInputs[nameVariable!.id]).toMatchObject({
        variableId: nameVariable!.id,
        value: "锅炉A",
        source: "frontend_manual_input",
        status: "ok",
        providerId: manualProviderId,
      });
    });
  });

  it("uses component name variable for structure tree label instead of modeling prototype label", async () => {
    appJotaiStore.set(engineeringWorkspaceModeAtom, "data");
    appJotaiStore.set(engineeringProjectDocumentAtom, createProjectDocument());
    appJotaiStore.set(componentCurveCatalogAtom, {
      curvesByType: {},
      loadStatusByType: {},
      errorsByType: {},
    });

    await render(<ExcalidrawApp />);

    await withExcalidrawDimensions({ width: 1920, height: 1080 }, async () => {
      const boiler = createEngineeringImage({
        id: "component:boiler",
        name: "锅炉原型",
        componentType: "Boiler",
      });

      API.updateScene({
        elements: [boiler],
        captureUpdate: CaptureUpdateAction.NEVER,
      });
      API.setSelectedElements([boiler]);
      API.setAppState({
        openSidebar: {
          name: "default",
          tab: "engineering-structure",
        },
      });

      await waitFor(() => {
        expect(screen.getByTestId("engineering-structure-tree")).toBeVisible();
      });

      let componentNodeTestId = "";
      await waitFor(() => {
        const project = appJotaiStore.get(engineeringProjectDocumentAtom);
        const componentEntity = Object.values(project.topology.componentsById).find(
          (component) =>
            (component.props.elementId === boiler.id ||
              (Array.isArray(component.props.elementIds) &&
                component.props.elementIds.includes(boiler.id))) &&
            component.templateKey === "Boiler",
        );

        expect(componentEntity).toBeDefined();
        componentNodeTestId = `engineering-structure-node-${componentEntity!.id}`;
      });

      fireEvent.click(screen.getByRole("tab", { name: /^Input$/i }));

      const nameInput = await screen.findByLabelText("参数输入-Boiler-Name");
      fireEvent.change(nameInput, {
        target: {
          value: "锅炉新名称",
        },
      });

      await waitFor(() => {
        expect(screen.getByTestId(componentNodeTestId)).toHaveTextContent(
          "锅炉新名称",
        );
      });
      expect(screen.getByTestId(componentNodeTestId)).not.toHaveTextContent(
        "锅炉原型",
      );
      await waitFor(() => {
        expect(screen.getByTestId(componentNodeTestId)).toBeVisible();
      });
    });
  });

  it("builds calculation request payload from scenario values when clicking calculate", async () => {
    appJotaiStore.set(engineeringWorkspaceModeAtom, "data");
    appJotaiStore.set(engineeringProjectDocumentAtom, createProjectDocument());
    appJotaiStore.set(componentCurveCatalogAtom, {
      curvesByType: {},
      loadStatusByType: {},
      errorsByType: {},
    });

    await render(<ExcalidrawApp />);

    await withExcalidrawDimensions({ width: 1920, height: 1080 }, async () => {
      const boiler = createEngineeringImage({
        id: "component:boiler",
        name: "锅炉",
        componentType: "Boiler",
      });

      API.updateScene({
        elements: [boiler],
        captureUpdate: CaptureUpdateAction.NEVER,
      });
      API.setSelectedElements([boiler]);

      fireEvent.click(screen.getByRole("tab", { name: /^Input$/i }));

      const nameInput = await screen.findByLabelText("参数输入-Boiler-Name");
      fireEvent.change(nameInput, {
        target: {
          value: "锅炉B",
        },
      });

      await waitFor(() => {
        const scenario = appJotaiStore.get(engineeringScenarioDocumentAtom);
        expect(Object.keys(scenario.manualInputs).length).toBeGreaterThan(0);
      });

      fireEvent.click(screen.getByTestId("engineering-calculate-trigger"));

      await waitFor(() => {
        const requestPayload = appJotaiStore.get(
          engineeringLastCalculationRequestAtom,
        );
        expect(requestPayload).not.toBeNull();
        expect(requestPayload!.manualInputs.length).toBeGreaterThan(0);
      });
      await waitFor(() => {
        expect(appJotaiStore.get(engineeringSelectedCalculationRunIdAtom)).toBeTruthy();
      });
      expect(appJotaiStore.get(engineeringRunRuntimeAtom)).toMatchObject({
        activeRunId: expect.any(String),
        errorMessage: null,
      });
    });
  });
});
