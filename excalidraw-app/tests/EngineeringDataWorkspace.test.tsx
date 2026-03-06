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
import { API } from "@excalidraw/excalidraw/tests/helpers/api";
import { Pointer } from "@excalidraw/excalidraw/tests/helpers/ui";
import { pointFrom } from "@excalidraw/math";

import ExcalidrawApp from "../App";
import { appJotaiStore } from "../app-jotai";
import { componentCurveCatalogAtom } from "../component-spec-store";
import { createProjectDocument } from "../engineering-domain";
import {
  engineeringLastCalculationRequestAtom,
  engineeringProjectDocumentAtom,
  engineeringRunRuntimeAtom,
  engineeringScenarioDocumentAtom,
  engineeringSelectedCalculationRunIdAtom,
} from "../engineering-domain-state";
import { engineeringWorkspaceModeAtom } from "../engineering-ui-state";

const PANEL_WIDTH_STORAGE_KEY = "engineering:selected-shape-actions-widths:v1";
const mouse = new Pointer("mouse");

const createEngineeringImage = ({
  id,
  name,
  componentType,
  anchors,
}: {
  id: string;
  name: string;
  componentType: string;
  anchors?: Record<string, unknown>[];
}) => {
  const image = API.createElement({
    id,
    type: "image",
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

describe("Engineering data workspace", () => {
  beforeEach(() => {
    window.localStorage.removeItem(PANEL_WIDTH_STORAGE_KEY);
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
