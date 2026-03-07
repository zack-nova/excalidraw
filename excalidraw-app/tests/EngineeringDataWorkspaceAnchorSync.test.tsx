import { describe, expect, it } from "vitest";

import {
  API,
  CaptureUpdateAction,
  appJotaiStore,
  componentCurveCatalogAtom,
  createEngineeringImage,
  createProjectDocument,
  engineeringProjectDocumentAtom,
  engineeringWorkspaceModeAtom,
  ExcalidrawApp,
  fireEvent,
  mouse,
  pointFrom,
  render,
  sceneCoordsToViewportCoords,
  screen,
  setupEngineeringWorkspaceBeforeEach,
  waitFor,
  withExcalidrawDimensions,
  within,
} from "./EngineeringDataWorkspaceTestHelpers";

describe("Engineering data workspace [anchor-sync]", () => {
  setupEngineeringWorkspaceBeforeEach();

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

});
