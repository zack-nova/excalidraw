import { getDefaultAppState } from "@excalidraw/excalidraw/appState";

import { describe, expect, it } from "vitest";

import {
  ENGINEERING_CHART_MATERIAL_DEFAULT_HEIGHT,
  ENGINEERING_CHART_MATERIAL_DEFAULT_WIDTH,
  applySelectedEngineeringChartMaterialConfig,
  buildEngineeringChartOptionFromMaterial,
  createEngineeringChartMaterialLibraryItems,
  parseEngineeringChartVariableKeys,
  renderEngineeringChartMaterialElement,
} from "./engineeringChartMaterial";
import { createEngineeringDataContext } from "./engineeringData";

import type { ExcalidrawElement } from "@excalidraw/element/types";
import type { AppState } from "@excalidraw/excalidraw/types";

const getChartMeta = (element: ExcalidrawElement) =>
  (element.customData as Record<string, any> | undefined)
    ?.engineeringChartMaterial as
    | {
        kind?: string;
        chartType?: string;
        mode?: string;
        bindings?: Record<string, string>;
        warnings?: string[];
        hasWarnings?: boolean;
        lastErrorSummary?: string | null;
        lastGoodOption?: Record<string, unknown> | null;
        lastGoodImageDataURL?: string | null;
        lastRenderImageDataURL?: string | null;
      }
    | undefined;

describe("engineering chart material", () => {
  it("creates four system chart templates with 480x320 defaults", () => {
    const libraryItems = createEngineeringChartMaterialLibraryItems();

    expect(libraryItems).toHaveLength(4);
    expect(libraryItems.map((item) => item.name)).toEqual([
      "折线图",
      "柱状图",
      "条状图",
      "饼图",
    ]);

    const chartTypes = libraryItems.map((item) => {
      const chartElement = item.elements[0];
      expect(chartElement.type).toBe("rectangle");
      expect(chartElement.width).toBe(ENGINEERING_CHART_MATERIAL_DEFAULT_WIDTH);
      expect(chartElement.height).toBe(ENGINEERING_CHART_MATERIAL_DEFAULT_HEIGHT);
      expect(chartElement.strokeColor).not.toBe("transparent");
      return getChartMeta(chartElement)?.chartType;
    });

    expect(chartTypes).toEqual(["line", "bar", "hbar", "pie"]);
  });

  it("extracts vars[...] tokens from bindings", () => {
    const tokens = parseEngineeringChartVariableKeys(
      '{{vars["plant.units.power.labels"]}} - {{vars[\'plant.units.power.values\']}} - {{ vars["plant.units.power.labels"] }}',
    );

    expect(tokens).toEqual([
      "plant.units.power.labels",
      "plant.units.power.values",
    ]);
  });

  it("applies chart config to selected chart and flags missing variable warnings", () => {
    const lineChartItem = createEngineeringChartMaterialLibraryItems()[0];
    const chartElement = lineChartItem.elements[0] as ExcalidrawElement;

    const appState: AppState = {
      ...getDefaultAppState(),
      width: 1280,
      height: 720,
      offsetTop: 0,
      offsetLeft: 0,
      selectedElementIds: {
        [chartElement.id]: true,
      },
    };

    const applyResult = applySelectedEngineeringChartMaterialConfig({
      elements: [chartElement],
      appState,
      patch: {
        mode: "code",
        code: '(vars) => ({ title: { text: "机组功率" } })',
        bindings: {
          labels: '{{vars["plant.units.power.labels"]}}',
          values: '{{vars["plant.units.power.values"]}}',
        },
      },
      availableVariableKeys: new Set(["plant.units.power.labels"]),
    });

    expect(applyResult).toBeTruthy();
    if (!applyResult) {
      return;
    }

    const nextChart = applyResult.elements.find(
      (element) => element.id === chartElement.id,
    );

    expect(nextChart).toBeDefined();
    if (!nextChart) {
      return;
    }

    const meta = getChartMeta(nextChart);
    expect(meta?.kind).toBe("chart");
    expect(meta?.mode).toBe("code");
    expect(meta?.bindings).toEqual({
      labels: '{{vars["plant.units.power.labels"]}}',
      values: '{{vars["plant.units.power.values"]}}',
    });
    expect(meta?.hasWarnings).toBe(true);
    expect(meta?.warnings || []).toContain(
      '变量不存在: plant.units.power.values',
    );
  });

  it("builds form option and truncates mismatched label/value lengths", () => {
    const barChartItem = createEngineeringChartMaterialLibraryItems()[1];
    const chartElement = barChartItem.elements[0] as ExcalidrawElement;
    const chartMeta = getChartMeta(chartElement);
    if (!chartMeta) {
      throw new Error("missing chart material metadata");
    }

    const context = createEngineeringDataContext([
      {
        id: "labels",
        alias: "plant.units.power.labels",
        value: '["1号机","2号机","3号机"]',
      },
      {
        id: "values",
        alias: "plant.units.power.values",
        value: "[630,615]",
      },
    ]);

    const buildResult = buildEngineeringChartOptionFromMaterial({
      material: chartMeta as any,
      context,
    });

    expect(buildResult.labels).toEqual(["1号机", "2号机"]);
    expect(buildResult.values).toEqual([630, 615]);
    expect(buildResult.warnings).toContain("分类与数值数量不一致，已按最短长度截断");
    expect(buildResult.option).toEqual(
      expect.objectContaining({
        series: expect.any(Array),
      }),
    );
  });

  it("renders form chart into snapshot data url and stores latest option", () => {
    const lineChartItem = createEngineeringChartMaterialLibraryItems()[0];
    const chartElement = lineChartItem.elements[0] as ExcalidrawElement;
    const context = createEngineeringDataContext([
      {
        id: "labels",
        alias: "plant.boiler.mainSteamPressure.labels",
        value: "08:00,08:05,08:10",
      },
      {
        id: "values",
        alias: "plant.boiler.mainSteamPressure.values",
        value: "13.2,13.4,13.1",
      },
    ]);

    const nextElement = renderEngineeringChartMaterialElement({
      element: chartElement,
      context,
    });

    const nextMeta = getChartMeta(nextElement);
    expect(nextMeta?.lastGoodOption).toBeTruthy();
    expect(nextMeta?.lastGoodImageDataURL).toMatch(/^data:image\/svg\+xml/);
    expect(nextMeta?.lastRenderImageDataURL).toMatch(/^data:image\/svg\+xml/);
  });

  it("executes code mode with vars api and writes option snapshot", () => {
    const lineChartItem = createEngineeringChartMaterialLibraryItems()[0];
    const chartElement = lineChartItem.elements[0] as ExcalidrawElement;
    const appState: AppState = {
      ...getDefaultAppState(),
      width: 1280,
      height: 720,
      offsetTop: 0,
      offsetLeft: 0,
      selectedElementIds: {
        [chartElement.id]: true,
      },
    };

    const patchedResult = applySelectedEngineeringChartMaterialConfig({
      elements: [chartElement],
      appState,
      patch: {
        mode: "code",
        code: `(vars) => ({
          title: { text: "代码模式示例" },
          color: ["#0ea5e9"],
          xAxis: { type: "category", data: vars["code.demo.labels"] },
          yAxis: { type: "value" },
          series: [{ type: "bar", data: vars["code.demo.values"] }]
        })`,
      },
      availableVariableKeys: new Set(),
    });

    expect(patchedResult).toBeTruthy();
    if (!patchedResult) {
      return;
    }

    const context = createEngineeringDataContext([
      {
        id: "labels",
        alias: "code.demo.labels",
        value: ["1号机", "2号机"] as any,
      },
      {
        id: "values",
        alias: "code.demo.values",
        value: [630, 615] as any,
      },
    ]);

    const nextElement = renderEngineeringChartMaterialElement({
      element: patchedResult.elements[0] as ExcalidrawElement,
      context,
    });
    const nextMeta = getChartMeta(nextElement);

    expect(nextMeta?.lastErrorSummary).toBeNull();
    expect(nextMeta?.hasWarnings).toBe(false);
    expect(nextMeta?.lastGoodOption).toEqual(
      expect.objectContaining({
        series: [expect.objectContaining({ data: [630, 615] })],
      }),
    );
    expect(nextMeta?.lastRenderImageDataURL).toMatch(/^data:image\/svg\+xml/);
  });

  it("parses JSON array strings in vars for code mode direct bindings", () => {
    const lineChartItem = createEngineeringChartMaterialLibraryItems()[0];
    const chartElement = lineChartItem.elements[0] as ExcalidrawElement;
    const appState: AppState = {
      ...getDefaultAppState(),
      width: 1280,
      height: 720,
      offsetTop: 0,
      offsetLeft: 0,
      selectedElementIds: {
        [chartElement.id]: true,
      },
    };

    const patchedResult = applySelectedEngineeringChartMaterialConfig({
      elements: [chartElement],
      appState,
      patch: {
        mode: "code",
        code: `(vars) => ({
          title: { text: "JSON字符串变量兼容" },
          xAxis: { type: "category", data: vars["plant.units.power.labels"] },
          yAxis: { type: "value" },
          series: [{ type: "bar", data: vars["plant.units.power.values"] }]
        })`,
      },
      availableVariableKeys: new Set(),
    });

    expect(patchedResult).toBeTruthy();
    if (!patchedResult) {
      return;
    }

    const context = createEngineeringDataContext([
      {
        id: "var:labels",
        alias: "plant.units.power.labels",
        value: '["1号机","2号机","3号机"]',
      },
      {
        id: "var:values",
        alias: "plant.units.power.values",
        value: "[630,615,642]",
      },
    ]);

    const nextElement = renderEngineeringChartMaterialElement({
      element: patchedResult.elements[0] as ExcalidrawElement,
      context,
    });
    const nextMeta = getChartMeta(nextElement);

    expect(nextMeta?.lastErrorSummary).toBeNull();
    expect(nextMeta?.lastGoodOption).toEqual(
      expect.objectContaining({
        xAxis: expect.objectContaining({ data: ["1号机", "2号机", "3号机"] }),
        series: [expect.objectContaining({ data: [630, 615, 642] })],
      }),
    );
    expect(nextMeta?.lastRenderImageDataURL).toMatch(/^data:image\/svg\+xml/);
  });

  it("keeps last good snapshot and shows placeholder metadata when code execution fails", () => {
    const lineChartItem = createEngineeringChartMaterialLibraryItems()[0];
    const chartElement = lineChartItem.elements[0] as ExcalidrawElement;
    const appState: AppState = {
      ...getDefaultAppState(),
      width: 1280,
      height: 720,
      offsetTop: 0,
      offsetLeft: 0,
      selectedElementIds: {
        [chartElement.id]: true,
      },
    };
    const context = createEngineeringDataContext([
      {
        id: "labels",
        alias: "code.demo.labels",
        value: ["1号机", "2号机"] as any,
      },
      {
        id: "values",
        alias: "code.demo.values",
        value: [630, 615] as any,
      },
    ]);

    const validCodeResult = applySelectedEngineeringChartMaterialConfig({
      elements: [chartElement],
      appState,
      patch: {
        mode: "code",
        code: `(vars) => ({
          title: { text: "稳定快照" },
          color: ["#22c55e"],
          xAxis: { type: "category", data: vars["code.demo.labels"] },
          yAxis: { type: "value" },
          series: [{ type: "bar", data: vars["code.demo.values"] }]
        })`,
      },
      availableVariableKeys: new Set(),
    });

    expect(validCodeResult).toBeTruthy();
    if (!validCodeResult) {
      return;
    }

    const successElement = renderEngineeringChartMaterialElement({
      element: validCodeResult.elements[0] as ExcalidrawElement,
      context,
    });
    const successMeta = getChartMeta(successElement);

    expect(successMeta?.lastGoodOption).toBeTruthy();
    expect(successMeta?.lastGoodImageDataURL).toMatch(/^data:image\/svg\+xml/);

    const failureCodeResult = applySelectedEngineeringChartMaterialConfig({
      elements: [successElement],
      appState,
      patch: {
        mode: "code",
        code: '(vars) => { throw new Error("故障信息".repeat(40)); }',
      },
      availableVariableKeys: new Set(),
    });

    expect(failureCodeResult).toBeTruthy();
    if (!failureCodeResult) {
      return;
    }

    const failedElement = renderEngineeringChartMaterialElement({
      element: failureCodeResult.elements[0] as ExcalidrawElement,
      context,
    });
    const failedMeta = getChartMeta(failedElement);

    expect(failedMeta?.lastErrorSummary).toMatch(/^代码执行失败：/);
    expect(failedMeta?.hasWarnings).toBe(true);
    expect(failedMeta?.warnings || []).toContain("代码错误信息过长，已截断");
    expect(failedMeta?.lastGoodOption).toEqual(successMeta?.lastGoodOption);
    expect(failedMeta?.lastGoodImageDataURL).toBe(successMeta?.lastGoodImageDataURL);
    expect(failedMeta?.lastRenderImageDataURL).toMatch(/^data:image\/svg\+xml/);
  });
});
