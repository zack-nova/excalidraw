import type { EngineeringDataContext } from "./engineeringData";
import type { EngineeringChartType } from "./engineering-chart-material-model";
import { isRecord } from "./engineering-chart-material-model";

const ENGINEERING_CHART_CODE_EXECUTION_TIMEOUT_MS = 100;
const ENGINEERING_CHART_ERROR_SUMMARY_MAX_LENGTH = 120;

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

export const buildChartVarsFromContext = (context: EngineeringDataContext) => {
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

export const executeEngineeringChartCode = ({
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

export const resolveChartTypeFromOption = ({
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

export const getChartSeriesFromOption = ({
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

export const resolveChartPreviewColor = (
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
