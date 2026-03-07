import { getSelectedElements, newElementWith } from "@excalidraw/element";

import type {
  ExcalidrawElement,
  NonDeletedExcalidrawElement,
} from "@excalidraw/element/types";
import type { AppState } from "@excalidraw/excalidraw/types";
import type { EngineeringDataContext } from "./engineeringData";
import {
  buildChartVarsFromContext,
  executeEngineeringChartCode,
  getChartSeriesFromOption,
  resolveChartPreviewColor,
  resolveChartTypeFromOption,
} from "./engineering-chart-code-runner";
import {
  ENGINEERING_CHART_MATERIAL_DEFAULT_HEIGHT,
  ENGINEERING_CHART_MATERIAL_DEFAULT_WIDTH,
  ENGINEERING_CHART_MATERIAL_META_KEY,
  buildEngineeringChartOptionFromMaterial,
  getEngineeringChartMaterialFromElement,
  getEngineeringChartMissingVariableWarnings,
  isEngineeringChartMaterialElement,
  type EngineeringChartMaterial,
  type EngineeringChartMaterialBindings,
  type EngineeringChartMaterialPatch,
} from "./engineering-chart-material-model";
import { createEngineeringChartMaterialLibraryItems } from "./engineering-chart-library-factory";
import {
  renderEngineeringChartErrorDataURL,
  renderEngineeringChartPreviewDataURL,
} from "./engineering-chart-svg-renderer";

export {
  ENGINEERING_CHART_MATERIAL_DEFAULT_HEIGHT,
  ENGINEERING_CHART_MATERIAL_DEFAULT_WIDTH,
  ENGINEERING_CHART_MATERIAL_META_KEY,
  buildEngineeringChartOptionFromMaterial,
  createEngineeringChartMaterialLibraryItems,
  getEngineeringChartMaterialFromElement,
  getEngineeringChartMissingVariableWarnings,
  isEngineeringChartMaterialElement,
};
export {
  collectEngineeringChartVariableKeys,
  parseEngineeringChartVariableKeys,
} from "./engineering-chart-material-model";
export type {
  EngineeringChartMaterial,
  EngineeringChartMaterialBindings,
  EngineeringChartMaterialPatch,
  EngineeringChartMode,
  EngineeringChartType,
} from "./engineering-chart-material-model";

export type SelectedEngineeringChartMaterialContext = {
  elementId: string;
  material: EngineeringChartMaterial;
};

const dedupeWarnings = (warnings: string[]) => Array.from(new Set(warnings));

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
    const codeResult = executeEngineeringChartCode({
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
      const previewDataURL = renderEngineeringChartPreviewDataURL({
        chartType: resolvedChartType,
        title: material.title,
        labels: seriesData.labels,
        values: seriesData.values,
        color: resolveChartPreviewColor(option, material.color),
        width,
        height,
        hasWarnings: false,
      });

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
      const placeholderDataURL = renderEngineeringChartErrorDataURL({
        title: material.title,
        errorSummary: codeResult.errorSummary,
        width,
        height,
      });

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
    const previewDataURL = renderEngineeringChartPreviewDataURL({
      chartType: material.chartType,
      title: material.title,
      labels,
      values,
      color: material.color,
      width,
      height,
      hasWarnings: warnings.length > 0,
    });

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
    return newElementWith(element as NonDeletedExcalidrawElement, {
      customData: {
        ...element.customData,
        [ENGINEERING_CHART_MATERIAL_META_KEY]: nextMaterial,
      },
    });
  });

  return {
    elements: nextElements,
    selectedElementIds: {
      [selectedContext.elementId]: true,
    } as AppState["selectedElementIds"],
    material: nextMaterial,
  };
};
