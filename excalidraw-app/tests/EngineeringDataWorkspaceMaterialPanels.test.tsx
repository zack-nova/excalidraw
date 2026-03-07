import { describe, expect, it } from "vitest";

import {
  act,
  API,
  PANEL_WIDTH_STORAGE_KEY,
  CaptureUpdateAction,
  appJotaiStore,
  componentCurveCatalogAtom,
  createEngineeringChartMaterialLibraryItems,
  createEngineeringImage,
  createEngineeringTableMaterialLibraryItem,
  createProjectDocument,
  engineeringProjectDocumentAtom,
  engineeringWorkspaceModeAtom,
  ExcalidrawApp,
  fireEvent,
  publishEngineeringData,
  render,
  screen,
  setupEngineeringWorkspaceBeforeEach,
  getTableCellAt,
  waitFor,
  withTableTemplateAt,
  withExcalidrawDimensions,
  within,
} from "./EngineeringDataWorkspaceTestHelpers";

describe("Engineering data workspace [material-panels]", () => {
  setupEngineeringWorkspaceBeforeEach();

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
      expect(screen.getByRole("tab", { name: /^Actions$/i })).toBeVisible();

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

});
