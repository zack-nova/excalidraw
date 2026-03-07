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
  render,
  screen,
  setupEngineeringWorkspaceBeforeEach,
  waitFor,
  withExcalidrawDimensions,
  within,
} from "./EngineeringDataWorkspaceTestHelpers";

describe("Engineering data workspace [structure-tree]", () => {
  setupEngineeringWorkspaceBeforeEach();

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

});
