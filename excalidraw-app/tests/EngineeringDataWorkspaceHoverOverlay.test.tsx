import { describe, expect, it } from "vitest";

import {
  act,
  API,
  CaptureUpdateAction,
  appJotaiStore,
  componentCurveCatalogAtom,
  createEngineeringImage,
  createProjectDocument,
  engineeringCalculationRunsAtom,
  engineeringProjectDocumentAtom,
  engineeringScenarioDocumentAtom,
  engineeringSelectedCalculationRunIdAtom,
  engineeringWorkspaceModeAtom,
  ExcalidrawApp,
  mouse,
  render,
  resolveEngineeringHoverTarget,
  sceneCoordsToViewportCoords,
  screen,
  setupEngineeringWorkspaceBeforeEach,
  waitFor,
  withExcalidrawDimensions,
  within,
} from "./EngineeringDataWorkspaceTestHelpers";

describe("Engineering data workspace [hover-overlay]", () => {
  setupEngineeringWorkspaceBeforeEach();

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

});
