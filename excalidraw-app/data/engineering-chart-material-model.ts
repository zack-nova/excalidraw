import type { ExcalidrawElement } from "@excalidraw/element/types";
import type { EngineeringDataContext } from "./engineeringData";

export const ENGINEERING_CHART_MATERIAL_META_KEY = "engineeringChartMaterial";
export const ENGINEERING_CHART_MATERIAL_DEFAULT_WIDTH = 480;
export const ENGINEERING_CHART_MATERIAL_DEFAULT_HEIGHT = 320;

const ENGINEERING_CHART_MATERIAL_PREVIEW_PRIMARY_COLOR = "#4c6ef5";

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

export type EngineeringChartMaterialPatch = Partial<
  Pick<EngineeringChartMaterial, "mode" | "title" | "code" | "color">
> & {
  bindings?: Partial<EngineeringChartMaterialBindings>;
  legendShow?: boolean;
  axis?: Partial<EngineeringChartMaterial["axis"]>;
};

export type ChartTemplateDefinition = {
  chartType: EngineeringChartType;
  name: string;
  title: string;
  labelsBinding: string;
  valuesBinding: string;
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

export const getEngineeringChartTemplateDefinitions = () =>
  CHART_TEMPLATE_DEFINITIONS;

export const isRecord = (value: unknown): value is Record<string, unknown> =>
  !!value && typeof value === "object" && !Array.isArray(value);

const isChartType = (value: unknown): value is EngineeringChartType =>
  value === "line" || value === "bar" || value === "hbar" || value === "pie";

const toNonEmptyString = (value: unknown, fallback: string) =>
  typeof value === "string" && value.trim().length > 0 ? value : fallback;

const getChartTemplateDefinitionByType = (chartType: EngineeringChartType) =>
  CHART_TEMPLATE_DEFINITIONS.find(
    (definition) => definition.chartType === chartType,
  ) || CHART_TEMPLATE_DEFINITIONS[0];

export const createDefaultChartMaterial = (
  chartType: EngineeringChartType,
): EngineeringChartMaterial => {
  const definition = getChartTemplateDefinitionByType(chartType);

  return {
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
  };
};

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

  const defaultMaterial = createDefaultChartMaterial(materialValue.chartType);
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
