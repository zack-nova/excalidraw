import {
  getSelectedElements,
  newElement,
  newElementWith,
} from "@excalidraw/element";

import type {
  ExcalidrawElement,
  NonDeletedExcalidrawElement,
} from "@excalidraw/element/types";
import type { AppState, LibraryItem } from "@excalidraw/excalidraw/types";
import type { EngineeringDataContext } from "./engineeringData";

export const ENGINEERING_CHART_MATERIAL_META_KEY = "engineeringChartMaterial";
export const ENGINEERING_CHART_MATERIAL_DEFAULT_WIDTH = 480;
export const ENGINEERING_CHART_MATERIAL_DEFAULT_HEIGHT = 320;

const ENGINEERING_CHART_MATERIAL_SOURCE_ID = "engineering-system";
const ENGINEERING_CHART_MATERIAL_SOURCE_NAME = "系统素材";
const ENGINEERING_CHART_MATERIAL_PREVIEW_PRIMARY_COLOR = "#4c6ef5";
const ENGINEERING_CHART_CODE_EXECUTION_TIMEOUT_MS = 100;
const ENGINEERING_CHART_ERROR_SUMMARY_MAX_LENGTH = 120;

export type EngineeringChartType = "line" | "bar" | "hbar" | "pie";
export type EngineeringChartMode = "form" | "code";

export type EngineeringChartMaterialBindings = {
  labels: string;
  values: string;
};

export type EngineeringChartMaterial = {
  kind: "chart";
  version: 1;
  chartType: EngineeringChartType;
  mode: EngineeringChartMode;
  title: string;
  legend: {
    show: boolean;
  };
  axis: {
    xName: string;
    yName: string;
  };
  color: string;
  bindings: EngineeringChartMaterialBindings;
  code: string;
  warnings: string[];
  hasWarnings: boolean;
  lastErrorSummary: string | null;
  lastGoodOption: Record<string, unknown> | null;
  lastGoodImageDataURL: string | null;
  lastRenderImageDataURL: string | null;
};

type ChartTemplateDefinition = {
  chartType: EngineeringChartType;
  name: string;
  title: string;
  labelsBinding: string;
  valuesBinding: string;
};

export type SelectedEngineeringChartMaterialContext = {
  elementId: string;
  material: EngineeringChartMaterial;
};

export type EngineeringChartMaterialPatch = Partial<
  Pick<EngineeringChartMaterial, "mode" | "title" | "code" | "color">
> & {
  bindings?: Partial<EngineeringChartMaterialBindings>;
  legendShow?: boolean;
  axis?: Partial<EngineeringChartMaterial["axis"]>;
};

const CHART_TEMPLATE_DEFINITIONS: readonly ChartTemplateDefinition[] = [
  {
    chartType: "line",
    name: "折线图",
    title: "主蒸汽压力趋势",
    labelsBinding: '{{vars["plant.boiler.mainSteamPressure.labels"]}}',
    valuesBinding: '{{vars["plant.boiler.mainSteamPressure.values"]}}',
  },
  {
    chartType: "bar",
    name: "柱状图",
    title: "机组发电功率对比",
    labelsBinding: '{{vars["plant.units.power.labels"]}}',
    valuesBinding: '{{vars["plant.units.power.values"]}}',
  },
  {
    chartType: "hbar",
    name: "条状图",
    title: "辅机电耗率",
    labelsBinding: '{{vars["plant.aux.rate.labels"]}}',
    valuesBinding: '{{vars["plant.aux.rate.values"]}}',
  },
  {
    chartType: "pie",
    name: "饼图",
    title: "燃料结构占比",
    labelsBinding: '{{vars["plant.fuel.mix.labels"]}}',
    valuesBinding: '{{vars["plant.fuel.mix.values"]}}',
  },
];

const isRecord = (value: unknown): value is Record<string, unknown> =>
  !!value && typeof value === "object" && !Array.isArray(value);

const isChartType = (value: unknown): value is EngineeringChartType =>
  value === "line" || value === "bar" || value === "hbar" || value === "pie";

const toNonEmptyString = (value: unknown, fallback: string) =>
  typeof value === "string" && value.trim().length > 0 ? value : fallback;

const createDefaultChartMaterial = (
  definition: ChartTemplateDefinition,
): EngineeringChartMaterial => ({
  kind: "chart",
  version: 1,
  chartType: definition.chartType,
  mode: "form",
  title: definition.title,
  legend: {
    show: true,
  },
  axis: {
    xName: "",
    yName: "",
  },
  color: "var(--color-primary)",
  bindings: {
    labels: definition.labelsBinding,
    values: definition.valuesBinding,
  },
  code: '(vars) => ({ title: { text: "图示" } })',
  warnings: [],
  hasWarnings: false,
  lastErrorSummary: null,
  lastGoodOption: null,
  lastGoodImageDataURL: null,
  lastRenderImageDataURL: null,
});

const getChartTemplateDefinitionByType = (chartType: EngineeringChartType) =>
  CHART_TEMPLATE_DEFINITIONS.find(
    (definition) => definition.chartType === chartType,
  ) || CHART_TEMPLATE_DEFINITIONS[0];

export const getEngineeringChartMaterialFromElement = (
  element: ExcalidrawElement,
): EngineeringChartMaterial | null => {
  const customData = isRecord(element.customData) ? element.customData : null;
  const materialValue = customData?.[ENGINEERING_CHART_MATERIAL_META_KEY];
  if (!isRecord(materialValue)) {
    return null;
  }

  if (materialValue.kind !== "chart" || !isChartType(materialValue.chartType)) {
    return null;
  }

  const definition = getChartTemplateDefinitionByType(materialValue.chartType);
  const defaultMaterial = createDefaultChartMaterial(definition);
  const bindings = isRecord(materialValue.bindings)
    ? {
        labels: toNonEmptyString(
          materialValue.bindings.labels,
          defaultMaterial.bindings.labels,
        ),
        values: toNonEmptyString(
          materialValue.bindings.values,
          defaultMaterial.bindings.values,
        ),
      }
    : defaultMaterial.bindings;

  return {
    ...defaultMaterial,
    chartType: materialValue.chartType,
    mode: materialValue.mode === "code" ? "code" : "form",
    title: toNonEmptyString(materialValue.title, defaultMaterial.title),
    legend:
      isRecord(materialValue.legend) &&
      typeof materialValue.legend.show === "boolean"
        ? {
            show: materialValue.legend.show,
          }
        : defaultMaterial.legend,
    axis:
      isRecord(materialValue.axis)
        ? {
            xName: toNonEmptyString(materialValue.axis.xName, ""),
            yName: toNonEmptyString(materialValue.axis.yName, ""),
          }
        : defaultMaterial.axis,
    color: toNonEmptyString(materialValue.color, defaultMaterial.color),
    bindings,
    code: toNonEmptyString(materialValue.code, defaultMaterial.code),
    warnings: Array.isArray(materialValue.warnings)
      ? materialValue.warnings.filter(
          (warning): warning is string => typeof warning === "string",
        )
      : [],
    hasWarnings: materialValue.hasWarnings === true,
    lastErrorSummary:
      typeof materialValue.lastErrorSummary === "string"
        ? materialValue.lastErrorSummary
        : null,
    lastGoodOption: isRecord(materialValue.lastGoodOption)
      ? materialValue.lastGoodOption
      : null,
    lastGoodImageDataURL:
      typeof materialValue.lastGoodImageDataURL === "string"
        ? materialValue.lastGoodImageDataURL
        : null,
    lastRenderImageDataURL:
      typeof materialValue.lastRenderImageDataURL === "string"
        ? materialValue.lastRenderImageDataURL
        : null,
  };
};

export const isEngineeringChartMaterialElement = (element: ExcalidrawElement) =>
  !!getEngineeringChartMaterialFromElement(element);

type EngineeringChartSeriesData = {
  labels: string[];
  values: number[];
  warnings: string[];
};

const parseMaybeJSONArray = (value: string) => {
  const trimmed = value.trim();
  if (!trimmed.startsWith("[") || !trimmed.endsWith("]")) {
    return null;
  }

  try {
    const parsed = JSON.parse(trimmed);
    return Array.isArray(parsed) ? parsed : null;
  } catch {
    return null;
  }
};

const toStringSeries = (value: unknown) => {
  if (Array.isArray(value)) {
    return value
      .map((item) => (item === null || item === undefined ? "" : String(item)))
      .map((item) => item.trim())
      .filter((item) => item.length > 0);
  }

  if (typeof value === "string") {
    const parsedArray = parseMaybeJSONArray(value);
    if (parsedArray) {
      return toStringSeries(parsedArray);
    }

    return value
      .split(/[，,]/u)
      .map((item) => item.trim())
      .filter((item) => item.length > 0);
  }

  if (typeof value === "number" || typeof value === "boolean") {
    return [String(value)];
  }

  return [] as string[];
};

const toNumberSeries = (value: unknown) => {
  if (Array.isArray(value)) {
    return value
      .map((item) => {
        if (typeof item === "number") {
          return Number.isFinite(item) ? item : null;
        }
        if (typeof item === "string" && item.trim().length > 0) {
          const parsed = Number(item);
          return Number.isFinite(parsed) ? parsed : null;
        }
        return null;
      })
      .filter((item): item is number => item !== null);
  }

  if (typeof value === "string") {
    const parsedArray = parseMaybeJSONArray(value);
    if (parsedArray) {
      return toNumberSeries(parsedArray);
    }

    return value
      .split(/[，,]/u)
      .map((item) => Number(item.trim()))
      .filter((item) => Number.isFinite(item));
  }

  if (typeof value === "number" && Number.isFinite(value)) {
    return [value];
  }

  return [] as number[];
};

const toStringArrayFromUnknown = (value: unknown) => {
  if (!Array.isArray(value)) {
    return [] as string[];
  }

  return value
    .map((item) => {
      if (item === null || item === undefined) {
        return "";
      }
      return String(item).trim();
    })
    .filter((item) => item.length > 0);
};

const toNumberArrayFromUnknown = (value: unknown) => {
  if (!Array.isArray(value)) {
    return [] as number[];
  }

  return value
    .map((item) => {
      if (typeof item === "number") {
        return Number.isFinite(item) ? item : null;
      }
      if (typeof item === "string" && item.trim().length > 0) {
        const parsed = Number(item.trim());
        return Number.isFinite(parsed) ? parsed : null;
      }
      return null;
    })
    .filter((item): item is number => item !== null);
};

const CHART_CODE_DISABLED_GLOBALS = [
  "window",
  "document",
  "globalThis",
  "self",
  "global",
  "process",
  "navigator",
  "location",
  "history",
  "localStorage",
  "sessionStorage",
  "indexedDB",
  "fetch",
  "XMLHttpRequest",
  "WebSocket",
  "EventSource",
  "postMessage",
  "importScripts",
  "setTimeout",
  "setInterval",
  "requestAnimationFrame",
  "cancelAnimationFrame",
  "queueMicrotask",
  "Promise",
  "Date",
  "Intl",
  "JSON",
  "RegExp",
  "Map",
  "Set",
  "WeakMap",
  "WeakSet",
  "Function",
  "Reflect",
  "Proxy",
  "ArrayBuffer",
  "SharedArrayBuffer",
  "Atomics",
  "Object",
  "Number",
  "String",
  "Boolean",
] as const;

const chartCodeRunnerCache = new Map<
  string,
  (vars: Record<string, unknown>) => Record<string, unknown>
>();

const getChartExecutionNow = () =>
  typeof performance !== "undefined" && typeof performance.now === "function"
    ? performance.now()
    : Date.now();

const truncateErrorMessage = (message: string) => {
  if (message.length <= ENGINEERING_CHART_ERROR_SUMMARY_MAX_LENGTH) {
    return {
      message,
      didTruncate: false,
    };
  }

  return {
    message: `${message.slice(0, ENGINEERING_CHART_ERROR_SUMMARY_MAX_LENGTH)}…`,
    didTruncate: true,
  };
};

const toChartCodeFailure = (
  error: unknown,
): {
  errorSummary: string;
  warnings: string[];
} => {
  const rawMessage =
    error instanceof Error && typeof error.message === "string"
      ? error.message
      : typeof error === "string"
        ? error
        : "未知错误";
  const normalizedMessage = rawMessage.trim() || "未知错误";
  const truncated = truncateErrorMessage(normalizedMessage);
  const warnings = truncated.didTruncate ? ["代码错误信息过长，已截断"] : [];

  return {
    errorSummary: `代码执行失败：${truncated.message}`,
    warnings,
  };
};

const buildChartCodeRunner = (code: string) => {
  const cachedRunner = chartCodeRunnerCache.get(code);
  if (cachedRunner) {
    return cachedRunner;
  }

  const parameterNames = ["Math", ...CHART_CODE_DISABLED_GLOBALS];
  const rawRunner = new Function(
    "vars",
    ...parameterNames,
    `"use strict";
const __factory__ = (${code});
if (typeof __factory__ !== "function") {
  throw new Error("代码必须是函数：(vars) => option");
}
const __result__ = __factory__(vars);
if (!__result__ || typeof __result__ !== "object" || Array.isArray(__result__)) {
  throw new Error("代码返回值必须是 option 对象");
}
return __result__;`,
  ) as (
    vars: Record<string, unknown>,
    ...globals: unknown[]
  ) => Record<string, unknown>;
  const disabledGlobalValues = CHART_CODE_DISABLED_GLOBALS.map(
    () => undefined,
  );
  const runner = (vars: Record<string, unknown>) =>
    rawRunner(vars, Math, ...disabledGlobalValues);

  chartCodeRunnerCache.set(code, runner);
  return runner;
};

const normalizeChartCodeVarValue = (value: unknown) => {
  if (typeof value !== "string") {
    return value;
  }

  const parsedArray = parseMaybeJSONArray(value);
  if (parsedArray) {
    return parsedArray;
  }

  return value;
};

const buildChartVarsFromContext = (context: EngineeringDataContext) => {
  const vars: Record<string, unknown> = {};

  Object.entries(context.values).forEach(([key, value]) => {
    const normalizedKey = key.trim();
    if (normalizedKey) {
      vars[normalizedKey] = normalizeChartCodeVarValue(value);
    }
  });

  context.rows.forEach((row) => {
    const candidates = [row.alias, row.id, row.uuid, row.name];
    candidates.forEach((candidate) => {
      if (typeof candidate !== "string") {
        return;
      }
      const normalizedKey = candidate.trim();
      if (!normalizedKey) {
        return;
      }
      vars[normalizedKey] = normalizeChartCodeVarValue(row.value);
    });
  });

  return vars;
};

const executeChartCodeRunner = ({
  code,
  vars,
}: {
  code: string;
  vars: Record<string, unknown>;
}) => {
  try {
    const runner = buildChartCodeRunner(code);
    const startedAt = getChartExecutionNow();
    const result = runner(vars);
    const duration = getChartExecutionNow() - startedAt;

    if (duration > ENGINEERING_CHART_CODE_EXECUTION_TIMEOUT_MS) {
      return {
        ok: false as const,
        errorSummary: `代码执行超时（>${ENGINEERING_CHART_CODE_EXECUTION_TIMEOUT_MS}ms）`,
        warnings: [] as string[],
      };
    }

    return {
      ok: true as const,
      option: result,
    };
  } catch (error) {
    const failure = toChartCodeFailure(error);
    return {
      ok: false as const,
      errorSummary: failure.errorSummary,
      warnings: failure.warnings,
    };
  }
};

const getBindingVariableKey = (bindingExpression: string) =>
  parseEngineeringChartVariableKeys(bindingExpression)[0] || null;

const resolveVariableValueFromContext = (
  context: EngineeringDataContext,
  variableKey: string,
) => {
  const values = context.values as Record<string, unknown>;
  if (variableKey in values) {
    return values[variableKey];
  }

  const aliasVariableId = context.aliasToId[variableKey];
  if (aliasVariableId && context.data[aliasVariableId]) {
    return context.data[aliasVariableId].value;
  }

  if (context.data[variableKey]) {
    return context.data[variableKey].value;
  }

  if (context.items[variableKey]) {
    return context.items[variableKey].value;
  }

  const rowMatch = context.rows.find((row) => {
    const alias = typeof row.alias === "string" ? row.alias : "";
    const id = typeof row.id === "string" ? row.id : "";
    const uuid = typeof row.uuid === "string" ? row.uuid : "";
    const name = typeof row.name === "string" ? row.name : "";
    return (
      alias === variableKey ||
      id === variableKey ||
      uuid === variableKey ||
      name === variableKey
    );
  });
  if (rowMatch) {
    return rowMatch.value;
  }

  return undefined;
};

const getSeriesDataFromBindings = ({
  bindings,
  context,
}: {
  bindings: EngineeringChartMaterialBindings;
  context: EngineeringDataContext;
}): EngineeringChartSeriesData => {
  const warnings: string[] = [];
  const labelsVariableKey = getBindingVariableKey(bindings.labels);
  const valuesVariableKey = getBindingVariableKey(bindings.values);

  if (!labelsVariableKey) {
    warnings.push("未配置分类变量");
  }
  if (!valuesVariableKey) {
    warnings.push("未配置数值变量");
  }

  const labelsSourceValue = labelsVariableKey
    ? resolveVariableValueFromContext(context, labelsVariableKey)
    : undefined;
  const valuesSourceValue = valuesVariableKey
    ? resolveVariableValueFromContext(context, valuesVariableKey)
    : undefined;

  if (labelsVariableKey && typeof labelsSourceValue === "undefined") {
    warnings.push(`变量不存在: ${labelsVariableKey}`);
  }
  if (valuesVariableKey && typeof valuesSourceValue === "undefined") {
    warnings.push(`变量不存在: ${valuesVariableKey}`);
  }

  let labels = toStringSeries(labelsSourceValue);
  let values = toNumberSeries(valuesSourceValue);

  if (labels.length > 0 && values.length > 0 && labels.length !== values.length) {
    const minLength = Math.min(labels.length, values.length);
    warnings.push("分类与数值数量不一致，已按最短长度截断");
    labels = labels.slice(0, minLength);
    values = values.slice(0, minLength);
  }

  return {
    labels,
    values,
    warnings,
  };
};

const dedupeWarnings = (warnings: string[]) => Array.from(new Set(warnings));

const buildPieSeriesData = (labels: string[], values: number[]) =>
  values.map((value, index) => ({
    name: labels[index] || `分类${index + 1}`,
    value,
  }));

export const buildEngineeringChartOptionFromMaterial = ({
  material,
  context,
}: {
  material: EngineeringChartMaterial;
  context: EngineeringDataContext;
}) => {
  const seriesData = getSeriesDataFromBindings({
    bindings: material.bindings,
    context,
  });
  const warnings = dedupeWarnings([
    ...material.warnings,
    ...seriesData.warnings,
  ]);

  const baseOption: Record<string, unknown> = {
    title: {
      text: material.title,
      left: "center",
    },
    legend: {
      show: material.legend.show,
      top: 24,
    },
    color: [material.color || ENGINEERING_CHART_MATERIAL_PREVIEW_PRIMARY_COLOR],
    animation: false,
  };

  if (material.chartType === "pie") {
    return {
      option: {
        ...baseOption,
        series: [
          {
            type: "pie",
            radius: "60%",
            data: buildPieSeriesData(seriesData.labels, seriesData.values),
          },
        ],
      },
      labels: seriesData.labels,
      values: seriesData.values,
      warnings,
    };
  }

  const isHorizontalBar = material.chartType === "hbar";
  const seriesType = material.chartType === "line" ? "line" : "bar";

  const option = {
    ...baseOption,
    xAxis: isHorizontalBar
      ? {
          type: "value",
          name: material.axis.xName,
        }
      : {
          type: "category",
          name: material.axis.xName,
          data: seriesData.labels,
        },
    yAxis: isHorizontalBar
      ? {
          type: "category",
          name: material.axis.yName,
          data: seriesData.labels,
        }
      : {
          type: "value",
          name: material.axis.yName,
        },
    series: [
      {
        type: seriesType,
        data: seriesData.values,
      },
    ],
  };

  return {
    option,
    labels: seriesData.labels,
    values: seriesData.values,
    warnings,
  };
};

const resolveChartTypeFromOption = ({
  fallbackChartType,
  option,
}: {
  fallbackChartType: EngineeringChartType;
  option: Record<string, unknown>;
}): EngineeringChartType => {
  const seriesArray = Array.isArray(option.series) ? option.series : [];
  const firstSeries = isRecord(seriesArray[0]) ? seriesArray[0] : null;
  if (!firstSeries || typeof firstSeries.type !== "string") {
    return fallbackChartType;
  }

  if (firstSeries.type === "pie") {
    return "pie";
  }
  if (firstSeries.type === "line") {
    return "line";
  }
  if (firstSeries.type === "bar") {
    const xAxisType =
      isRecord(option.xAxis) && typeof option.xAxis.type === "string"
        ? option.xAxis.type
        : "";
    const yAxisType =
      isRecord(option.yAxis) && typeof option.yAxis.type === "string"
        ? option.yAxis.type
        : "";
    if (xAxisType === "value" && yAxisType === "category") {
      return "hbar";
    }
    return "bar";
  }

  return fallbackChartType;
};

const getChartSeriesFromOption = ({
  chartType,
  option,
}: {
  chartType: EngineeringChartType;
  option: Record<string, unknown>;
}) => {
  const seriesArray = Array.isArray(option.series) ? option.series : [];
  const firstSeries = isRecord(seriesArray[0]) ? seriesArray[0] : null;

  if (!firstSeries) {
    return {
      labels: [] as string[],
      values: [] as number[],
    };
  }

  if (chartType === "pie") {
    const pieData = Array.isArray(firstSeries.data) ? firstSeries.data : [];
    const labels: string[] = [];
    const values: number[] = [];

    pieData.forEach((item, index) => {
      if (isRecord(item)) {
        const name =
          typeof item.name === "string" && item.name.trim().length > 0
            ? item.name
            : `分类${index + 1}`;
        const numericValue =
          typeof item.value === "number"
            ? item.value
            : Number(typeof item.value === "string" ? item.value.trim() : NaN);
        if (Number.isFinite(numericValue)) {
          labels.push(name);
          values.push(numericValue);
        }
      } else if (typeof item === "number" && Number.isFinite(item)) {
        labels.push(`分类${index + 1}`);
        values.push(item);
      }
    });

    return {
      labels,
      values,
    };
  }

  const axisValue =
    chartType === "hbar"
      ? isRecord(option.yAxis)
        ? option.yAxis.data
        : undefined
      : isRecord(option.xAxis)
        ? option.xAxis.data
        : undefined;
  const labels = toStringArrayFromUnknown(axisValue);
  const values = toNumberArrayFromUnknown(firstSeries.data);

  if (labels.length === 0 && values.length > 0) {
    return {
      labels: values.map((_, index) => `分类${index + 1}`),
      values,
    };
  }

  if (labels.length > 0 && values.length > 0 && labels.length !== values.length) {
    const minLength = Math.min(labels.length, values.length);
    return {
      labels: labels.slice(0, minLength),
      values: values.slice(0, minLength),
    };
  }

  return {
    labels,
    values,
  };
};

const resolveChartPreviewColor = (
  option: Record<string, unknown> | null,
  fallback: string,
) => {
  const optionColors = option?.color;
  if (Array.isArray(optionColors)) {
    const firstColor = optionColors.find(
      (color): color is string =>
        typeof color === "string" && color.trim().length > 0,
    );
    if (firstColor) {
      return firstColor;
    }
  }

  return fallback;
};

const resolvePreviewColor = (value: string) => {
  const trimmed = value.trim();
  if (!trimmed || trimmed.includes("var(")) {
    return ENGINEERING_CHART_MATERIAL_PREVIEW_PRIMARY_COLOR;
  }

  return trimmed;
};

const clamp = (value: number, min: number, max: number) =>
  Math.min(max, Math.max(min, value));

const escapeXml = (value: string) =>
  value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");

const createSimpleChartSvg = ({
  chartType,
  title,
  labels,
  values,
  color,
  width,
  height,
  hasWarnings,
}: {
  chartType: EngineeringChartType;
  title: string;
  labels: string[];
  values: number[];
  color: string;
  width: number;
  height: number;
  hasWarnings: boolean;
}) => {
  const safeColor = resolvePreviewColor(color);
  const safeTitle = escapeXml(title || "图示");
  const x = 36;
  const y = 44;
  const chartWidth = Math.max(1, width - 52);
  const chartHeight = Math.max(1, height - 76);
  const bottom = y + chartHeight;
  const right = x + chartWidth;

  let body = `<rect x="${x}" y="${y}" width="${chartWidth}" height="${chartHeight}" fill="#ffffff" stroke="#d9dee7" rx="6" />`;

  if (labels.length === 0 || values.length === 0) {
    body += `<text x="${x + chartWidth / 2}" y="${y + chartHeight / 2}" text-anchor="middle" fill="#8a93a6" font-size="12">等待变量数据</text>`;
  } else if (chartType === "line") {
    const max = Math.max(...values);
    const min = Math.min(...values);
    const range = max - min || 1;
    const step = labels.length > 1 ? chartWidth / (labels.length - 1) : chartWidth;
    const points = values
      .map((value, index) => {
        const px = x + index * step;
        const normalized = (value - min) / range;
        const py = bottom - normalized * chartHeight;
        return `${px.toFixed(2)},${py.toFixed(2)}`;
      })
      .join(" ");
    body += `<polyline points="${points}" fill="none" stroke="${safeColor}" stroke-width="2.4" />`;
  } else if (chartType === "bar") {
    const max = Math.max(...values, 1);
    const barCount = values.length;
    const gap = 8;
    const barWidth = (chartWidth - gap * (barCount + 1)) / barCount;
    values.forEach((value, index) => {
      const normalized = value / max;
      const barHeight = clamp(normalized * chartHeight, 2, chartHeight);
      const barX = x + gap + index * (barWidth + gap);
      const barY = bottom - barHeight;
      body += `<rect x="${barX.toFixed(2)}" y="${barY.toFixed(2)}" width="${barWidth.toFixed(2)}" height="${barHeight.toFixed(2)}" fill="${safeColor}" rx="2" />`;
    });
  } else if (chartType === "hbar") {
    const max = Math.max(...values, 1);
    const barCount = values.length;
    const gap = 6;
    const barHeight = (chartHeight - gap * (barCount + 1)) / barCount;
    values.forEach((value, index) => {
      const normalized = value / max;
      const barWidth = clamp(normalized * chartWidth, 2, chartWidth);
      const barY = y + gap + index * (barHeight + gap);
      body += `<rect x="${x}" y="${barY.toFixed(2)}" width="${barWidth.toFixed(2)}" height="${barHeight.toFixed(2)}" fill="${safeColor}" rx="2" />`;
    });
  } else {
    const sum = values.reduce((total, value) => total + value, 0) || 1;
    const cx = x + chartWidth / 2;
    const cy = y + chartHeight / 2;
    const radius = Math.min(chartWidth, chartHeight) * 0.34;
    let angle = -Math.PI / 2;

    values.forEach((value, index) => {
      const ratio = value / sum;
      const nextAngle = angle + ratio * Math.PI * 2;
      const x1 = cx + radius * Math.cos(angle);
      const y1 = cy + radius * Math.sin(angle);
      const x2 = cx + radius * Math.cos(nextAngle);
      const y2 = cy + radius * Math.sin(nextAngle);
      const largeArc = ratio > 0.5 ? 1 : 0;
      const hue = (index * 67) % 360;
      const sliceColor = `hsl(${hue} 70% 56%)`;
      body += `<path d="M ${cx.toFixed(2)} ${cy.toFixed(2)} L ${x1.toFixed(2)} ${y1.toFixed(2)} A ${radius.toFixed(2)} ${radius.toFixed(2)} 0 ${largeArc} 1 ${x2.toFixed(2)} ${y2.toFixed(2)} Z" fill="${sliceColor}" />`;
      angle = nextAngle;
    });
  }

  if (hasWarnings) {
    const badgeX = right - 10;
    const badgeY = y + 10;
    body += `<circle cx="${badgeX}" cy="${badgeY}" r="8" fill="#d9480f" />`;
    body += `<text x="${badgeX}" y="${badgeY + 4}" text-anchor="middle" fill="#ffffff" font-size="11" font-weight="700">!</text>`;
  }

  return `<?xml version="1.0" encoding="UTF-8"?><svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}"><rect width="100%" height="100%" fill="#f7f9fc"/><text x="18" y="24" fill="#1f2430" font-size="13" font-weight="600">${safeTitle}</text>${body}</svg>`;
};

const createChartErrorPlaceholderSvg = ({
  title,
  errorSummary,
  width,
  height,
}: {
  title: string;
  errorSummary: string;
  width: number;
  height: number;
}) => {
  const safeTitle = escapeXml(title || "图示");
  const safeError = escapeXml(errorSummary);
  const lineMaxChars = 20;
  const line1 = safeError.slice(0, lineMaxChars);
  const line2 = safeError.slice(lineMaxChars, lineMaxChars * 2);
  const line3 = safeError.slice(lineMaxChars * 2, lineMaxChars * 3);

  return `<?xml version="1.0" encoding="UTF-8"?><svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}"><rect width="100%" height="100%" fill="#f8fafc"/><text x="18" y="24" fill="#1f2430" font-size="13" font-weight="600">${safeTitle}</text><rect x="26" y="46" width="${Math.max(10, width - 52)}" height="${Math.max(10, height - 70)}" rx="8" fill="#fff5f5" stroke="#ffccd5"/><text x="40" y="84" fill="#d9480f" font-size="12" font-weight="700">代码执行异常</text><text x="40" y="106" fill="#495057" font-size="11">${line1}</text><text x="40" y="124" fill="#495057" font-size="11">${line2}</text><text x="40" y="142" fill="#495057" font-size="11">${line3}</text></svg>`;
};

const toSvgDataURL = (svg: string) =>
  `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;

export const renderEngineeringChartMaterialElement = ({
  element,
  context,
}: {
  element: ExcalidrawElement;
  context: EngineeringDataContext;
}): ExcalidrawElement => {
  const material = getEngineeringChartMaterialFromElement(element);
  if (!material || element.isDeleted) {
    return element;
  }

  const width = Math.max(
    60,
    Math.round(element.width || ENGINEERING_CHART_MATERIAL_DEFAULT_WIDTH),
  );
  const height = Math.max(
    60,
    Math.round(element.height || ENGINEERING_CHART_MATERIAL_DEFAULT_HEIGHT),
  );

  let nextMaterial: EngineeringChartMaterial;

  if (material.mode === "code") {
    const vars = buildChartVarsFromContext(context);
    const codeResult = executeChartCodeRunner({
      code: material.code,
      vars,
    });

    if (codeResult.ok) {
      const option = codeResult.option;
      const resolvedChartType = resolveChartTypeFromOption({
        fallbackChartType: material.chartType,
        option,
      });
      const seriesData = getChartSeriesFromOption({
        chartType: resolvedChartType,
        option,
      });
      const previewSvg = createSimpleChartSvg({
        chartType: resolvedChartType,
        title: material.title,
        labels: seriesData.labels,
        values: seriesData.values,
        color: resolveChartPreviewColor(option, material.color),
        width,
        height,
        hasWarnings: false,
      });
      const previewDataURL = toSvgDataURL(previewSvg);

      nextMaterial = {
        ...material,
        warnings: [],
        hasWarnings: false,
        lastErrorSummary: null,
        lastGoodOption: option,
        lastGoodImageDataURL: previewDataURL,
        lastRenderImageDataURL: previewDataURL,
      };
    } else {
      const nextWarnings = dedupeWarnings([
        codeResult.errorSummary,
        ...codeResult.warnings,
      ]);
      const placeholderSvg = createChartErrorPlaceholderSvg({
        title: material.title,
        errorSummary: codeResult.errorSummary,
        width,
        height,
      });
      const placeholderDataURL = toSvgDataURL(placeholderSvg);

      nextMaterial = {
        ...material,
        warnings: nextWarnings,
        hasWarnings: true,
        lastErrorSummary: codeResult.errorSummary,
        lastRenderImageDataURL: placeholderDataURL,
      };
    }
  } else {
    const { option, labels, values, warnings } =
      buildEngineeringChartOptionFromMaterial({
        material,
        context,
      });
    const previewSvg = createSimpleChartSvg({
      chartType: material.chartType,
      title: material.title,
      labels,
      values,
      color: material.color,
      width,
      height,
      hasWarnings: warnings.length > 0,
    });
    const previewDataURL = toSvgDataURL(previewSvg);

    nextMaterial = {
      ...material,
      warnings,
      hasWarnings: warnings.length > 0,
      lastErrorSummary: null,
      lastGoodOption: option,
      lastGoodImageDataURL: previewDataURL,
      lastRenderImageDataURL: previewDataURL,
    };
  }

  const previousOptionSerialized = JSON.stringify(material.lastGoodOption || null);
  const nextOptionSerialized = JSON.stringify(nextMaterial.lastGoodOption || null);
  const didChange =
    material.lastRenderImageDataURL !== nextMaterial.lastRenderImageDataURL ||
    material.lastGoodImageDataURL !== nextMaterial.lastGoodImageDataURL ||
    material.lastErrorSummary !== nextMaterial.lastErrorSummary ||
    material.hasWarnings !== nextMaterial.hasWarnings ||
    material.warnings.join("|") !== nextMaterial.warnings.join("|") ||
    previousOptionSerialized !== nextOptionSerialized;

  if (!didChange) {
    return element;
  }

  return newElementWith(element as NonDeletedExcalidrawElement, {
    customData: {
      ...element.customData,
      [ENGINEERING_CHART_MATERIAL_META_KEY]: nextMaterial,
    },
  });
};

export const renderEngineeringChartMaterialElements = ({
  elements,
  context,
  targetElementIds,
}: {
  elements: readonly ExcalidrawElement[];
  context: EngineeringDataContext;
  targetElementIds?: ReadonlySet<string>;
}) => {
  let didChange = false;

  const nextElements = elements.map((element) => {
    if (targetElementIds && !targetElementIds.has(element.id)) {
      return element;
    }
    const nextElement = renderEngineeringChartMaterialElement({
      element,
      context,
    });
    if (nextElement !== element) {
      didChange = true;
    }
    return nextElement;
  });

  return {
    elements: didChange ? nextElements : elements,
    didChange,
  };
};

const createChartMaterialLibraryItem = (
  definition: ChartTemplateDefinition,
): LibraryItem => {
  const material = createDefaultChartMaterial(definition);

  return {
    id: `component-library:engineering-chart-material:${definition.chartType}`,
    status: "unpublished",
    created: Date.now(),
    name: definition.name,
    sourceId: ENGINEERING_CHART_MATERIAL_SOURCE_ID,
    sourceName: ENGINEERING_CHART_MATERIAL_SOURCE_NAME,
    sourceKind: "public",
    componentGroup: "图示",
    searchKeywords: [
      "图示",
      definition.name,
      definition.chartType,
      "chart",
      "vars",
      "{{...}}",
    ],
    elements: [
      newElement({
        type: "rectangle",
        x: 0,
        y: 0,
        width: ENGINEERING_CHART_MATERIAL_DEFAULT_WIDTH,
        height: ENGINEERING_CHART_MATERIAL_DEFAULT_HEIGHT,
        customData: {
          [ENGINEERING_CHART_MATERIAL_META_KEY]: material,
        },
      }),
    ],
  };
};

export const createEngineeringChartMaterialLibraryItems = () =>
  CHART_TEMPLATE_DEFINITIONS.map((definition) =>
    createChartMaterialLibraryItem(definition),
  );

export const parseEngineeringChartVariableKeys = (expression: string) => {
  const tokens = new Set<string>();
  for (const match of expression.matchAll(/vars\[\s*(["'])(.+?)\1\s*\]/g)) {
    const token = (match[2] || "").trim();
    if (token) {
      tokens.add(token);
    }
  }
  return Array.from(tokens);
};

export const collectEngineeringChartVariableKeys = (
  bindings: EngineeringChartMaterialBindings,
) => {
  const tokens = new Set<string>();
  Object.values(bindings).forEach((expression) => {
    parseEngineeringChartVariableKeys(expression).forEach((token) =>
      tokens.add(token),
    );
  });
  return Array.from(tokens);
};

export const getEngineeringChartMissingVariableWarnings = ({
  bindings,
  availableVariableKeys,
}: {
  bindings: EngineeringChartMaterialBindings;
  availableVariableKeys: ReadonlySet<string>;
}) =>
  collectEngineeringChartVariableKeys(bindings)
    .filter((token) => !availableVariableKeys.has(token))
    .map((token) => `变量不存在: ${token}`);

export const getSelectedEngineeringChartMaterialContext = ({
  elements,
  appState,
}: {
  elements: readonly ExcalidrawElement[];
  appState: AppState;
}): SelectedEngineeringChartMaterialContext | null => {
  const selectedElements = getSelectedElements(elements, appState, {
    includeBoundTextElement: false,
    includeElementsInFrames: false,
  });

  if (selectedElements.length !== 1) {
    return null;
  }

  const selectedElement = selectedElements[0];
  const material = getEngineeringChartMaterialFromElement(selectedElement);
  if (!material) {
    return null;
  }

  return {
    elementId: selectedElement.id,
    material,
  };
};

export const applySelectedEngineeringChartMaterialConfig = ({
  elements,
  appState,
  patch,
  availableVariableKeys,
}: {
  elements: readonly ExcalidrawElement[];
  appState: AppState;
  patch: EngineeringChartMaterialPatch;
  availableVariableKeys: ReadonlySet<string>;
}) => {
  const selectedContext = getSelectedEngineeringChartMaterialContext({
    elements,
    appState,
  });
  if (!selectedContext) {
    return null;
  }

  const nextBindings: EngineeringChartMaterialBindings = {
    ...selectedContext.material.bindings,
    ...(patch.bindings || {}),
  };

  const nextMaterial: EngineeringChartMaterial = {
    ...selectedContext.material,
    mode: patch.mode || selectedContext.material.mode,
    title: patch.title ?? selectedContext.material.title,
    code: patch.code ?? selectedContext.material.code,
    color: patch.color ?? selectedContext.material.color,
    legend:
      typeof patch.legendShow === "boolean"
        ? {
            show: patch.legendShow,
          }
        : selectedContext.material.legend,
    axis: {
      xName: patch.axis?.xName ?? selectedContext.material.axis.xName,
      yName: patch.axis?.yName ?? selectedContext.material.axis.yName,
    },
    bindings: nextBindings,
  };

  const warnings = getEngineeringChartMissingVariableWarnings({
    bindings: nextBindings,
    availableVariableKeys,
  });
  nextMaterial.warnings = warnings;
  nextMaterial.hasWarnings = warnings.length > 0;

  const nextElements = elements.map((element) => {
    if (element.id !== selectedContext.elementId) {
      return element;
    }
    return newElementWith(
      element as NonDeletedExcalidrawElement,
      {
        customData: {
          ...element.customData,
          [ENGINEERING_CHART_MATERIAL_META_KEY]: nextMaterial,
        },
      },
    );
  });

  return {
    elements: nextElements,
    selectedElementIds: {
      [selectedContext.elementId]: true,
    } as AppState["selectedElementIds"],
    material: nextMaterial,
  };
};
