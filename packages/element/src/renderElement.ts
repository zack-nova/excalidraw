import rough from "roughjs/bin/rough";

import {
  type GlobalPoint,
  isRightAngleRads,
  lineSegment,
  pointFrom,
  pointRotateRads,
  type Radians,
} from "@excalidraw/math";

import {
  BOUND_TEXT_PADDING,
  DEFAULT_REDUCED_GLOBAL_ALPHA,
  ELEMENT_READY_TO_ERASE_OPACITY,
  FRAME_STYLE,
  DARK_THEME_FILTER,
  MIME_TYPES,
  THEME,
  distance,
  getFontString,
  isRTL,
  getVerticalOffset,
  invariant,
  applyDarkModeFilter,
  isSafari,
} from "@excalidraw/common";

import type {
  AppState,
  StaticCanvasAppState,
  Zoom,
  InteractiveCanvasAppState,
  ElementsPendingErasure,
  PendingExcalidrawElements,
  NormalizedZoomValue,
} from "@excalidraw/excalidraw/types";

import type {
  StaticCanvasRenderConfig,
  RenderableElementsMap,
  InteractiveCanvasRenderConfig,
} from "@excalidraw/excalidraw/scene/types";

import { getElementAbsoluteCoords, getElementBounds } from "./bounds";
import { getUncroppedImageElement } from "./cropElement";
import { LinearElementEditor } from "./linearElementEditor";
import {
  getBoundTextElement,
  getContainerCoords,
  getContainerElement,
  getBoundTextMaxHeight,
  getBoundTextMaxWidth,
} from "./textElement";
import { getLineHeightInPx } from "./textMeasurements";
import {
  isTextElement,
  isLinearElement,
  isFreeDrawElement,
  isInitializedImageElement,
  isArrowElement,
  hasBoundTextElement,
  isMagicFrameElement,
  isImageElement,
} from "./typeChecks";
import { getContainingFrame } from "./frame";
import { getCornerRadius } from "./utils";

import { ShapeCache } from "./shape";

import type {
  ExcalidrawElement,
  ExcalidrawTextElement,
  NonDeletedExcalidrawElement,
  ExcalidrawFreeDrawElement,
  ExcalidrawImageElement,
  ExcalidrawTextElementWithContainer,
  ExcalidrawFrameLikeElement,
  NonDeletedSceneElementsMap,
  ElementsMap,
} from "./types";

import type { RoughCanvas } from "roughjs/bin/canvas";

const isPendingImageElement = (
  element: ExcalidrawElement,
  renderConfig: StaticCanvasRenderConfig,
) =>
  isInitializedImageElement(element) &&
  !renderConfig.imageCache.has(element.fileId);

const getCanvasPadding = (element: ExcalidrawElement) => {
  switch (element.type) {
    case "freedraw":
      return element.strokeWidth * 12;
    case "text":
      return element.fontSize / 2;
    case "arrow":
      if (element.endArrowhead || element.endArrowhead) {
        return 40;
      }
      return 20;
    default:
      return 20;
  }
};

export const getRenderOpacity = (
  element: ExcalidrawElement,
  containingFrame: ExcalidrawFrameLikeElement | null,
  elementsPendingErasure: ElementsPendingErasure,
  pendingNodes: Readonly<PendingExcalidrawElements> | null,
  globalAlpha: number = 1,
) => {
  // multiplying frame opacity with element opacity to combine them
  // (e.g. frame 50% and element 50% opacity should result in 25% opacity)
  let opacity =
    (((containingFrame?.opacity ?? 100) * element.opacity) / 10000) *
    globalAlpha;

  // if pending erasure, multiply again to combine further
  // (so that erasing always results in lower opacity than original)
  if (
    elementsPendingErasure.has(element.id) ||
    (pendingNodes && pendingNodes.some((node) => node.id === element.id)) ||
    (containingFrame && elementsPendingErasure.has(containingFrame.id))
  ) {
    opacity *= ELEMENT_READY_TO_ERASE_OPACITY / 100;
  }

  return opacity;
};

export interface ExcalidrawElementWithCanvas {
  element: ExcalidrawElement | ExcalidrawTextElement;
  canvas: HTMLCanvasElement;
  theme: AppState["theme"];
  scale: number;
  angle: number;
  zoomValue: AppState["zoom"]["value"];
  canvasOffsetX: number;
  canvasOffsetY: number;
  boundTextElementVersion: number | null;
  imageCrop: ExcalidrawImageElement["crop"] | null;
  containingFrameOpacity: number;
  boundTextCanvas: HTMLCanvasElement;
}

const cappedElementCanvasSize = (
  element: NonDeletedExcalidrawElement,
  elementsMap: ElementsMap,
  zoom: Zoom,
): {
  width: number;
  height: number;
  scale: number;
} => {
  // these limits are ballpark, they depend on specific browsers and device.
  // We've chosen lower limits to be safe. We might want to change these limits
  // based on browser/device type, if we get reports of low quality rendering
  // on zoom.
  //
  // ~ safari mobile canvas area limit
  const AREA_LIMIT = 16777216;
  // ~ safari width/height limit based on developer.mozilla.org.
  const WIDTH_HEIGHT_LIMIT = 32767;

  const padding = getCanvasPadding(element);

  const [x1, y1, x2, y2] = getElementAbsoluteCoords(element, elementsMap);
  const elementWidth =
    isLinearElement(element) || isFreeDrawElement(element)
      ? distance(x1, x2)
      : element.width;
  const elementHeight =
    isLinearElement(element) || isFreeDrawElement(element)
      ? distance(y1, y2)
      : element.height;

  let width = elementWidth * window.devicePixelRatio + padding * 2;
  let height = elementHeight * window.devicePixelRatio + padding * 2;

  let scale: number = zoom.value;

  // rescale to ensure width and height is within limits
  if (
    width * scale > WIDTH_HEIGHT_LIMIT ||
    height * scale > WIDTH_HEIGHT_LIMIT
  ) {
    scale = Math.min(WIDTH_HEIGHT_LIMIT / width, WIDTH_HEIGHT_LIMIT / height);
  }

  // rescale to ensure canvas area is within limits
  if (width * height * scale * scale > AREA_LIMIT) {
    scale = Math.sqrt(AREA_LIMIT / (width * height));
  }

  width = Math.floor(width * scale);
  height = Math.floor(height * scale);

  return { width, height, scale };
};

const generateElementCanvas = (
  element: NonDeletedExcalidrawElement,
  elementsMap: NonDeletedSceneElementsMap,
  zoom: Zoom,
  renderConfig: StaticCanvasRenderConfig,
  appState: StaticCanvasAppState | InteractiveCanvasAppState,
): ExcalidrawElementWithCanvas | null => {
  const canvas = document.createElement("canvas");
  const context = canvas.getContext("2d")!;
  const padding = getCanvasPadding(element);

  const { width, height, scale } = cappedElementCanvasSize(
    element,
    elementsMap,
    zoom,
  );

  if (!width || !height) {
    return null;
  }

  canvas.width = width;
  canvas.height = height;

  let canvasOffsetX = -100;
  let canvasOffsetY = 0;

  if (isLinearElement(element) || isFreeDrawElement(element)) {
    const [x1, y1] = getElementAbsoluteCoords(element, elementsMap);

    canvasOffsetX =
      element.x > x1
        ? distance(element.x, x1) * window.devicePixelRatio * scale
        : 0;

    canvasOffsetY =
      element.y > y1
        ? distance(element.y, y1) * window.devicePixelRatio * scale
        : 0;

    context.translate(canvasOffsetX, canvasOffsetY);
  }

  context.save();
  context.translate(padding * scale, padding * scale);
  context.scale(
    window.devicePixelRatio * scale,
    window.devicePixelRatio * scale,
  );

  const rc = rough.canvas(canvas);

  drawElementOnCanvas(element, rc, context, renderConfig);

  context.restore();

  const boundTextElement = getBoundTextElement(element, elementsMap);
  const boundTextCanvas = document.createElement("canvas");
  const boundTextCanvasContext = boundTextCanvas.getContext("2d")!;

  if (isArrowElement(element) && boundTextElement) {
    const [x1, y1, x2, y2] = getElementAbsoluteCoords(element, elementsMap);
    // Take max dimensions of arrow canvas so that when canvas is rotated
    // the arrow doesn't get clipped
    const maxDim = Math.max(distance(x1, x2), distance(y1, y2));
    boundTextCanvas.width =
      maxDim * window.devicePixelRatio * scale + padding * scale * 10;
    boundTextCanvas.height =
      maxDim * window.devicePixelRatio * scale + padding * scale * 10;
    boundTextCanvasContext.translate(
      boundTextCanvas.width / 2,
      boundTextCanvas.height / 2,
    );
    boundTextCanvasContext.rotate(element.angle);
    boundTextCanvasContext.drawImage(
      canvas!,
      -canvas.width / 2,
      -canvas.height / 2,
      canvas.width,
      canvas.height,
    );

    const [, , , , boundTextCx, boundTextCy] = getElementAbsoluteCoords(
      boundTextElement,
      elementsMap,
    );

    boundTextCanvasContext.rotate(-element.angle);
    const offsetX = (boundTextCanvas.width - canvas!.width) / 2;
    const offsetY = (boundTextCanvas.height - canvas!.height) / 2;
    const shiftX =
      boundTextCanvas.width / 2 -
      (boundTextCx - x1) * window.devicePixelRatio * scale -
      offsetX -
      padding * scale;

    const shiftY =
      boundTextCanvas.height / 2 -
      (boundTextCy - y1) * window.devicePixelRatio * scale -
      offsetY -
      padding * scale;
    boundTextCanvasContext.translate(-shiftX, -shiftY);
    // Clear the bound text area
    boundTextCanvasContext.clearRect(
      -(boundTextElement.width / 2 + BOUND_TEXT_PADDING) *
        window.devicePixelRatio *
        scale,
      -(boundTextElement.height / 2 + BOUND_TEXT_PADDING) *
        window.devicePixelRatio *
        scale,
      (boundTextElement.width + BOUND_TEXT_PADDING * 2) *
        window.devicePixelRatio *
        scale,
      (boundTextElement.height + BOUND_TEXT_PADDING * 2) *
        window.devicePixelRatio *
        scale,
    );
  }

  return {
    element,
    canvas,
    theme: appState.theme,
    scale,
    zoomValue: zoom.value,
    canvasOffsetX,
    canvasOffsetY,
    boundTextElementVersion:
      getBoundTextElement(element, elementsMap)?.version || null,
    containingFrameOpacity:
      getContainingFrame(element, elementsMap)?.opacity || 100,
    boundTextCanvas,
    angle: element.angle,
    imageCrop: isImageElement(element) ? element.crop : null,
  };
};

export const DEFAULT_LINK_SIZE = 14;

const IMAGE_PLACEHOLDER_IMG =
  typeof document !== "undefined"
    ? document.createElement("img")
    : ({ src: "" } as HTMLImageElement); // mock image element outside of browser

IMAGE_PLACEHOLDER_IMG.src = `data:${MIME_TYPES.svg},${encodeURIComponent(
  `<svg aria-hidden="true" focusable="false" data-prefix="fas" data-icon="image" class="svg-inline--fa fa-image fa-w-16" role="img" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512"><path fill="#888" d="M464 448H48c-26.51 0-48-21.49-48-48V112c0-26.51 21.49-48 48-48h416c26.51 0 48 21.49 48 48v288c0 26.51-21.49 48-48 48zM112 120c-30.928 0-56 25.072-56 56s25.072 56 56 56 56-25.072 56-56-25.072-56-56-56zM64 384h384V272l-87.515-87.515c-4.686-4.686-12.284-4.686-16.971 0L208 320l-55.515-55.515c-4.686-4.686-12.284-4.686-16.971 0L64 336v48z"></path></svg>`,
)}`;

const IMAGE_ERROR_PLACEHOLDER_IMG =
  typeof document !== "undefined"
    ? document.createElement("img")
    : ({ src: "" } as HTMLImageElement); // mock image element outside of browser

IMAGE_ERROR_PLACEHOLDER_IMG.src = `data:${MIME_TYPES.svg},${encodeURIComponent(
  `<svg viewBox="0 0 668 668" xmlns="http://www.w3.org/2000/svg" xml:space="preserve" style="fill-rule:evenodd;clip-rule:evenodd;stroke-linejoin:round;stroke-miterlimit:2"><path d="M464 448H48c-26.51 0-48-21.49-48-48V112c0-26.51 21.49-48 48-48h416c26.51 0 48 21.49 48 48v288c0 26.51-21.49 48-48 48ZM112 120c-30.928 0-56 25.072-56 56s25.072 56 56 56 56-25.072 56-56-25.072-56-56-56ZM64 384h384V272l-87.515-87.515c-4.686-4.686-12.284-4.686-16.971 0L208 320l-55.515-55.515c-4.686-4.686-12.284-4.686-16.971 0L64 336v48Z" style="fill:#888;fill-rule:nonzero" transform="matrix(.81709 0 0 .81709 124.825 145.825)"/><path d="M256 8C119.034 8 8 119.033 8 256c0 136.967 111.034 248 248 248s248-111.034 248-248S392.967 8 256 8Zm130.108 117.892c65.448 65.448 70 165.481 20.677 235.637L150.47 105.216c70.204-49.356 170.226-44.735 235.638 20.676ZM125.892 386.108c-65.448-65.448-70-165.481-20.677-235.637L361.53 406.784c-70.203 49.356-170.226 44.736-235.638-20.676Z" style="fill:#888;fill-rule:nonzero" transform="matrix(.30366 0 0 .30366 506.822 60.065)"/></svg>`,
)}`;

const drawImagePlaceholder = (
  element: ExcalidrawImageElement,
  context: CanvasRenderingContext2D,
  theme: StaticCanvasRenderConfig["theme"],
) => {
  context.fillStyle = theme === THEME.DARK ? "#2E2E2E" : "#E7E7E7";
  context.fillRect(0, 0, element.width, element.height);

  const imageMinWidthOrHeight = Math.min(element.width, element.height);

  const size = Math.min(
    imageMinWidthOrHeight,
    Math.min(imageMinWidthOrHeight * 0.4, 100),
  );

  context.drawImage(
    element.status === "error"
      ? IMAGE_ERROR_PLACEHOLDER_IMG
      : IMAGE_PLACEHOLDER_IMG,
    element.width / 2 - size / 2,
    element.height / 2 - size / 2,
    size,
    size,
  );
};

const ENGINEERING_CHART_MATERIAL_META_KEY = "engineeringChartMaterial";
const CHART_PREVIEW_FALLBACK_COLOR = "#3b82f6";

type EngineeringChartPreviewType = "line" | "bar" | "hbar" | "pie";

type EngineeringChartPreviewMaterial = {
  kind: "chart";
  chartType: EngineeringChartPreviewType;
  title: string;
  hasWarnings: boolean;
  lastErrorSummary: string | null;
  lastGoodOption: Record<string, unknown> | null;
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  !!value && typeof value === "object" && !Array.isArray(value);

const isEngineeringChartPreviewType = (
  value: unknown,
): value is EngineeringChartPreviewType =>
  value === "line" || value === "bar" || value === "hbar" || value === "pie";

const toCanvasSafeColor = (value: string | null | undefined) => {
  const trimmed = typeof value === "string" ? value.trim() : "";
  if (!trimmed) {
    return null;
  }
  if (/var\(/i.test(trimmed)) {
    return null;
  }
  return trimmed;
};

const toStringArray = (value: unknown) => {
  if (!Array.isArray(value)) {
    return [] as string[];
  }

  return value
    .map((item) => {
      if (item === null || item === undefined) {
        return "";
      }
      return String(item);
    })
    .filter((item) => item.length > 0);
};

const toNumberArray = (value: unknown) => {
  if (!Array.isArray(value)) {
    return [] as number[];
  }

  return value
    .map((item) => {
      if (typeof item === "number") {
        return Number.isFinite(item) ? item : null;
      }
      if (typeof item === "string") {
        const parsed = Number(item.trim());
        return Number.isFinite(parsed) ? parsed : null;
      }
      return null;
    })
    .filter((item): item is number => item !== null);
};

const getEngineeringChartPreviewMaterial = (
  element: NonDeletedExcalidrawElement,
): EngineeringChartPreviewMaterial | null => {
  const customData = isRecord(element.customData) ? element.customData : null;
  if (!customData) {
    return null;
  }

  const materialValue = customData[ENGINEERING_CHART_MATERIAL_META_KEY];
  if (!isRecord(materialValue)) {
    return null;
  }

  if (
    materialValue.kind !== "chart" ||
    !isEngineeringChartPreviewType(materialValue.chartType)
  ) {
    return null;
  }

  return {
    kind: "chart",
    chartType: materialValue.chartType,
    title: typeof materialValue.title === "string" ? materialValue.title : "Chart",
    hasWarnings: materialValue.hasWarnings === true,
    lastErrorSummary:
      typeof materialValue.lastErrorSummary === "string"
        ? materialValue.lastErrorSummary
        : null,
    lastGoodOption: isRecord(materialValue.lastGoodOption)
      ? materialValue.lastGoodOption
      : null,
  };
};

const getPrimaryChartColor = (option: Record<string, unknown> | null) => {
  if (!option) {
    return CHART_PREVIEW_FALLBACK_COLOR;
  }
  const optionColors = option.color;
  if (!Array.isArray(optionColors)) {
    return CHART_PREVIEW_FALLBACK_COLOR;
  }
  const firstColor = optionColors.find(
    (color): color is string =>
      typeof color === "string" && color.trim().length > 0,
  );
  return toCanvasSafeColor(firstColor) || CHART_PREVIEW_FALLBACK_COLOR;
};

const getChartSeriesData = ({
  chartType,
  option,
}: {
  chartType: EngineeringChartPreviewType;
  option: Record<string, unknown> | null;
}) => {
  if (!option) {
    return {
      labels: [] as string[],
      values: [] as number[],
    };
  }

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
            : `Item ${index + 1}`;
        const numericValue =
          typeof item.value === "number"
            ? item.value
            : Number(typeof item.value === "string" ? item.value.trim() : NaN);
        if (Number.isFinite(numericValue)) {
          labels.push(name);
          values.push(numericValue);
        }
      } else if (typeof item === "number" && Number.isFinite(item)) {
        labels.push(`Item ${index + 1}`);
        values.push(item);
      }
    });

    return {
      labels,
      values,
    };
  }

  const values = toNumberArray(firstSeries.data);
  const axisValue =
    chartType === "hbar"
      ? isRecord(option.yAxis)
        ? option.yAxis.data
        : undefined
      : isRecord(option.xAxis)
        ? option.xAxis.data
        : undefined;
  const labels = toStringArray(axisValue);
  if (labels.length === 0 && values.length > 0) {
    return {
      labels: values.map((_, index) => String(index + 1)),
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

const getPieSliceColor = (
  index: number,
  option: Record<string, unknown> | null,
) => {
  const optionColors = option?.color;
  if (Array.isArray(optionColors)) {
    const fromPalette = optionColors[index % optionColors.length];
    if (typeof fromPalette === "string" && fromPalette.trim().length > 0) {
      const safeColor = toCanvasSafeColor(fromPalette);
      if (safeColor) {
        return safeColor;
      }
    }
  }

  return `hsl(${(index * 67) % 360} 70% 56%)`;
};

const drawEngineeringChartPreview = (
  element: NonDeletedExcalidrawElement,
  context: CanvasRenderingContext2D,
  renderConfig: StaticCanvasRenderConfig,
) => {
  if (element.type !== "rectangle" || element.isDeleted) {
    return;
  }

  const material = getEngineeringChartPreviewMaterial(element);
  if (!material) {
    return;
  }

  const padding = Math.max(8, Math.min(element.width, element.height) * 0.04);
  const previewX = padding;
  const previewY = padding;
  const previewWidth = Math.max(32, element.width - padding * 2);
  const previewHeight = Math.max(32, element.height - padding * 2);
  const title = material.title.trim().length > 0 ? material.title : "Chart";
  const option = material.lastGoodOption;
  const { labels, values } = getChartSeriesData({
    chartType: material.chartType,
    option,
  });
  const primaryColor = getPrimaryChartColor(option);

  const panelFill =
    renderConfig.theme === THEME.DARK ? "rgba(15, 23, 42, 0.88)" : "#f8fafc";
  const panelStroke = renderConfig.theme === THEME.DARK ? "#475569" : "#d6dce8";
  const titleColor = renderConfig.theme === THEME.DARK ? "#e2e8f0" : "#111827";
  const plotStroke = renderConfig.theme === THEME.DARK ? "#334155" : "#e5e7eb";
  const emptyColor = renderConfig.theme === THEME.DARK ? "#94a3b8" : "#6b7280";

  context.save();

  context.fillStyle = panelFill;
  context.strokeStyle = panelStroke;
  context.lineWidth = 1;
  context.fillRect(previewX, previewY, previewWidth, previewHeight);
  context.strokeRect(previewX, previewY, previewWidth, previewHeight);

  context.fillStyle = titleColor;
  context.font = '600 13px "Virgil", "Segoe UI", sans-serif';
  context.textBaseline = "top";
  context.fillText(title, previewX + 8, previewY + 6, previewWidth - 16);

  const plotX = previewX + 10;
  const plotY = previewY + 28;
  const plotWidth = Math.max(12, previewWidth - 20);
  const plotHeight = Math.max(12, previewHeight - 38);

  context.fillStyle = renderConfig.theme === THEME.DARK ? "#1e293b" : "#ffffff";
  context.fillRect(plotX, plotY, plotWidth, plotHeight);
  context.strokeStyle = plotStroke;
  context.strokeRect(plotX, plotY, plotWidth, plotHeight);

  if (material.lastErrorSummary) {
    const summary = material.lastErrorSummary;
    const lineMaxChars = 26;
    const firstLine = summary.slice(0, lineMaxChars);
    const secondLine = summary.slice(lineMaxChars, lineMaxChars * 2);
    const thirdLine = summary.slice(lineMaxChars * 2, lineMaxChars * 3);

    context.fillStyle =
      renderConfig.theme === THEME.DARK ? "rgba(127, 29, 29, 0.34)" : "#fff1f2";
    context.fillRect(plotX + 2, plotY + 2, plotWidth - 4, plotHeight - 4);

    context.fillStyle = "#dc2626";
    context.font = '600 12px "Virgil", "Segoe UI", sans-serif';
    context.textBaseline = "top";
    context.fillText("代码执行异常", plotX + 8, plotY + 8, plotWidth - 16);

    context.fillStyle = renderConfig.theme === THEME.DARK ? "#f8fafc" : "#334155";
    context.font = '11px "Virgil", "Segoe UI", sans-serif';
    context.fillText(firstLine, plotX + 8, plotY + 28, plotWidth - 16);
    context.fillText(secondLine, plotX + 8, plotY + 44, plotWidth - 16);
    context.fillText(thirdLine, plotX + 8, plotY + 60, plotWidth - 16);

    context.restore();
    return;
  }

  if (values.length === 0) {
    context.fillStyle = emptyColor;
    context.font = '12px "Virgil", "Segoe UI", sans-serif';
    context.textBaseline = "middle";
    context.textAlign = "center";
    context.fillText("Waiting data", plotX + plotWidth / 2, plotY + plotHeight / 2);
    context.textAlign = "start";
    context.restore();
    return;
  }

  context.save();
  context.beginPath();
  context.rect(plotX, plotY, plotWidth, plotHeight);
  context.clip();

  if (material.chartType === "line") {
    const max = Math.max(...values);
    const min = Math.min(...values);
    const range = max - min || 1;
    const stepX = values.length > 1 ? plotWidth / (values.length - 1) : 0;

    context.strokeStyle = primaryColor;
    context.lineWidth = 2;
    context.beginPath();
    values.forEach((value, index) => {
      const px = values.length > 1 ? plotX + stepX * index : plotX + plotWidth / 2;
      const py = plotY + plotHeight - ((value - min) / range) * plotHeight;
      if (index === 0) {
        context.moveTo(px, py);
      } else {
        context.lineTo(px, py);
      }
    });
    context.stroke();
  } else if (material.chartType === "bar") {
    const max = Math.max(...values, 1);
    const slotWidth = plotWidth / values.length;
    const barWidth = Math.max(1, slotWidth * 0.62);
    context.fillStyle = primaryColor;
    values.forEach((value, index) => {
      const normalized = Math.max(0, value) / max;
      const barHeight = Math.max(1, normalized * plotHeight);
      const barX = plotX + index * slotWidth + (slotWidth - barWidth) / 2;
      const barY = plotY + plotHeight - barHeight;
      context.fillRect(barX, barY, barWidth, barHeight);
    });
  } else if (material.chartType === "hbar") {
    const max = Math.max(...values, 1);
    const slotHeight = plotHeight / values.length;
    const barHeight = Math.max(1, slotHeight * 0.62);
    context.fillStyle = primaryColor;
    values.forEach((value, index) => {
      const normalized = Math.max(0, value) / max;
      const barWidth = Math.max(1, normalized * plotWidth);
      const barX = plotX;
      const barY = plotY + index * slotHeight + (slotHeight - barHeight) / 2;
      context.fillRect(barX, barY, barWidth, barHeight);
    });
  } else {
    const sum = values.reduce((total, value) => total + Math.max(0, value), 0);
    if (sum > 0) {
      const radius = Math.max(2, Math.min(plotWidth, plotHeight) * 0.34);
      const centerX = plotX + plotWidth / 2;
      const centerY = plotY + plotHeight / 2;
      let startAngle = -Math.PI / 2;

      values.forEach((value, index) => {
        const ratio = Math.max(0, value) / sum;
        const endAngle = startAngle + ratio * Math.PI * 2;
        context.beginPath();
        context.moveTo(centerX, centerY);
        context.arc(centerX, centerY, radius, startAngle, endAngle);
        context.closePath();
        context.fillStyle = getPieSliceColor(index, option);
        context.fill();
        startAngle = endAngle;
      });
    }
  }

  context.restore();

  if (material.hasWarnings) {
    const badgeX = previewX + previewWidth - 10;
    const badgeY = previewY + 10;
    context.beginPath();
    context.fillStyle = "#f97316";
    context.arc(badgeX, badgeY, 6.5, 0, Math.PI * 2);
    context.fill();
    context.fillStyle = "#ffffff";
    context.font = '700 10px "Virgil", "Segoe UI", sans-serif';
    context.textAlign = "center";
    context.textBaseline = "middle";
    context.fillText("!", badgeX, badgeY + 0.5);
    context.textAlign = "start";
  }

  if (labels.length > 0 && material.chartType !== "pie") {
    const label = labels[0];
    if (label) {
      context.fillStyle = emptyColor;
      context.font = '10px "Virgil", "Segoe UI", sans-serif';
      context.textBaseline = "bottom";
      context.fillText(label, plotX + 2, plotY + plotHeight - 2, plotWidth - 4);
    }
  }

  context.restore();
};

const drawElementOnCanvas = (
  element: NonDeletedExcalidrawElement,
  rc: RoughCanvas,
  context: CanvasRenderingContext2D,
  renderConfig: StaticCanvasRenderConfig,
) => {
  switch (element.type) {
    case "rectangle":
    case "iframe":
    case "embeddable":
    case "diamond":
    case "ellipse": {
      context.lineJoin = "round";
      context.lineCap = "round";

      const chartMaterial =
        element.type === "rectangle"
          ? getEngineeringChartPreviewMaterial(element)
          : null;

      const shapeElement =
        chartMaterial && element.type === "rectangle"
          ? ({
              ...element,
              strokeColor: "transparent",
            } as typeof element)
          : element;

      rc.draw(ShapeCache.generateElementShape(shapeElement, renderConfig));
      if (chartMaterial) {
        drawEngineeringChartPreview(element, context, renderConfig);
      }
      break;
    }
    case "arrow":
    case "line": {
      context.lineJoin = "round";
      context.lineCap = "round";

      ShapeCache.generateElementShape(element, renderConfig).forEach(
        (shape) => {
          rc.draw(shape);
        },
      );
      break;
    }
    case "freedraw": {
      // Draw directly to canvas
      context.save();

      const shapes = ShapeCache.generateElementShape(element, renderConfig);

      for (const shape of shapes) {
        if (typeof shape === "string") {
          context.fillStyle =
            renderConfig.theme === THEME.DARK
              ? applyDarkModeFilter(element.strokeColor)
              : element.strokeColor;
          context.fill(new Path2D(shape));
        } else {
          rc.draw(shape);
        }
      }

      context.restore();
      break;
    }
    case "image": {
      context.save();
      const cacheEntry =
        element.fileId !== null
          ? renderConfig.imageCache.get(element.fileId)
          : null;
      const img = isInitializedImageElement(element)
        ? cacheEntry?.image
        : undefined;

      if (img != null && !(img instanceof Promise)) {
        if (element.roundness && context.roundRect) {
          context.beginPath();
          context.roundRect(
            0,
            0,
            element.width,
            element.height,
            getCornerRadius(Math.min(element.width, element.height), element),
          );
          context.clip();
        }

        const { x, y, width, height } = element.crop
          ? element.crop
          : {
              x: 0,
              y: 0,
              width: img.naturalWidth,
              height: img.naturalHeight,
            };

        const shouldInvertImage =
          renderConfig.theme === THEME.DARK &&
          cacheEntry?.mimeType === MIME_TYPES.svg;

        if (shouldInvertImage && isSafari) {
          const devicePixelRatio = window.devicePixelRatio || 1;
          const tempCanvas = document.createElement("canvas");
          tempCanvas.width = element.width * devicePixelRatio;
          tempCanvas.height = element.height * devicePixelRatio;
          const tempContext = tempCanvas.getContext("2d");

          if (tempContext) {
            tempContext.scale(devicePixelRatio, devicePixelRatio);
            tempContext.drawImage(
              img,
              x,
              y,
              width,
              height,
              0,
              0,
              element.width,
              element.height,
            );

            const imageData = tempContext.getImageData(
              0,
              0,
              tempCanvas.width,
              tempCanvas.height,
            );

            const data = imageData.data;

            for (let i = 0; i < data.length; i += 4) {
              data[i] = 255 - data[i];
              data[i + 1] = 255 - data[i + 1];
              data[i + 2] = 255 - data[i + 2];
            }

            tempContext.putImageData(imageData, 0, 0);
            context.drawImage(
              tempCanvas,
              0,
              0,
              tempCanvas.width,
              tempCanvas.height,
              0,
              0,
              element.width,
              element.height,
            );
          }
        } else {
          if (shouldInvertImage) {
            context.filter = DARK_THEME_FILTER;
          }

          context.drawImage(
            img,
            x,
            y,
            width,
            height,
            0 /* hardcoded for the selection box*/,
            0,
            element.width,
            element.height,
          );
        }
      } else {
        drawImagePlaceholder(element, context, renderConfig.theme);
      }
      context.restore();
      break;
    }
    default: {
      if (isTextElement(element)) {
        const rtl = isRTL(element.text);
        const shouldTemporarilyAttach = rtl && !context.canvas.isConnected;
        if (shouldTemporarilyAttach) {
          // to correctly render RTL text mixed with LTR, we have to append it
          // to the DOM
          document.body.appendChild(context.canvas);
        }
        context.canvas.setAttribute("dir", rtl ? "rtl" : "ltr");
        context.save();
        context.font = getFontString(element);
        context.fillStyle =
          renderConfig.theme === THEME.DARK
            ? applyDarkModeFilter(element.strokeColor)
            : element.strokeColor;
        context.textAlign = element.textAlign as CanvasTextAlign;

        // Canvas does not support multiline text by default
        const lines = element.text.replace(/\r\n?/g, "\n").split("\n");

        const horizontalOffset =
          element.textAlign === "center"
            ? element.width / 2
            : element.textAlign === "right"
            ? element.width
            : 0;

        const lineHeightPx = getLineHeightInPx(
          element.fontSize,
          element.lineHeight,
        );

        const verticalOffset = getVerticalOffset(
          element.fontFamily,
          element.fontSize,
          lineHeightPx,
        );

        for (let index = 0; index < lines.length; index++) {
          context.fillText(
            lines[index],
            horizontalOffset,
            index * lineHeightPx + verticalOffset,
          );
        }
        context.restore();
        if (shouldTemporarilyAttach) {
          context.canvas.remove();
        }
      } else {
        throw new Error(`Unimplemented type ${element.type}`);
      }
    }
  }
};

export const elementWithCanvasCache = new WeakMap<
  ExcalidrawElement,
  ExcalidrawElementWithCanvas
>();

const generateElementWithCanvas = (
  element: NonDeletedExcalidrawElement,
  elementsMap: NonDeletedSceneElementsMap,
  renderConfig: StaticCanvasRenderConfig,
  appState: StaticCanvasAppState | InteractiveCanvasAppState,
) => {
  const zoom: Zoom = renderConfig
    ? appState.zoom
    : {
        value: 1 as NormalizedZoomValue,
      };
  const prevElementWithCanvas = elementWithCanvasCache.get(element);
  const shouldRegenerateBecauseZoom =
    prevElementWithCanvas &&
    prevElementWithCanvas.zoomValue !== zoom.value &&
    !appState?.shouldCacheIgnoreZoom;
  const boundTextElement = getBoundTextElement(element, elementsMap);
  const boundTextElementVersion = boundTextElement?.version || null;
  const imageCrop = isImageElement(element) ? element.crop : null;

  const containingFrameOpacity =
    getContainingFrame(element, elementsMap)?.opacity || 100;

  if (
    !prevElementWithCanvas ||
    shouldRegenerateBecauseZoom ||
    prevElementWithCanvas.theme !== appState.theme ||
    prevElementWithCanvas.boundTextElementVersion !== boundTextElementVersion ||
    prevElementWithCanvas.imageCrop !== imageCrop ||
    prevElementWithCanvas.containingFrameOpacity !== containingFrameOpacity ||
    // since we rotate the canvas when copying from cached canvas, we don't
    // regenerate the cached canvas. But we need to in case of labels which are
    // cached alongside the arrow, and we want the labels to remain unrotated
    // with respect to the arrow.
    (isArrowElement(element) &&
      boundTextElement &&
      element.angle !== prevElementWithCanvas.angle)
  ) {
    const elementWithCanvas = generateElementCanvas(
      element,
      elementsMap,
      zoom,
      renderConfig,
      appState,
    );

    if (!elementWithCanvas) {
      return null;
    }

    elementWithCanvasCache.set(element, elementWithCanvas);

    return elementWithCanvas;
  }
  return prevElementWithCanvas;
};

const drawElementFromCanvas = (
  elementWithCanvas: ExcalidrawElementWithCanvas,
  context: CanvasRenderingContext2D,
  renderConfig: StaticCanvasRenderConfig,
  appState: StaticCanvasAppState | InteractiveCanvasAppState,
  allElementsMap: NonDeletedSceneElementsMap,
) => {
  const element = elementWithCanvas.element;
  const padding = getCanvasPadding(element);
  const zoom = elementWithCanvas.scale;
  const [x1, y1, x2, y2] = getElementAbsoluteCoords(element, allElementsMap);
  const cx = ((x1 + x2) / 2 + appState.scrollX) * window.devicePixelRatio;
  const cy = ((y1 + y2) / 2 + appState.scrollY) * window.devicePixelRatio;

  context.save();
  context.scale(1 / window.devicePixelRatio, 1 / window.devicePixelRatio);

  const boundTextElement = getBoundTextElement(element, allElementsMap);

  if (isArrowElement(element) && boundTextElement) {
    const offsetX =
      (elementWithCanvas.boundTextCanvas.width -
        elementWithCanvas.canvas!.width) /
      2;
    const offsetY =
      (elementWithCanvas.boundTextCanvas.height -
        elementWithCanvas.canvas!.height) /
      2;
    context.translate(cx, cy);
    context.drawImage(
      elementWithCanvas.boundTextCanvas,
      (-(x2 - x1) / 2) * window.devicePixelRatio - offsetX / zoom - padding,
      (-(y2 - y1) / 2) * window.devicePixelRatio - offsetY / zoom - padding,
      elementWithCanvas.boundTextCanvas.width / zoom,
      elementWithCanvas.boundTextCanvas.height / zoom,
    );
  } else {
    // we translate context to element center so that rotation and scale
    // originates from the element center
    context.translate(cx, cy);

    context.rotate(element.angle);

    if (
      "scale" in elementWithCanvas.element &&
      !isPendingImageElement(element, renderConfig)
    ) {
      context.scale(
        elementWithCanvas.element.scale[0],
        elementWithCanvas.element.scale[1],
      );
    }

    // revert afterwards we don't have account for it during drawing
    context.translate(-cx, -cy);

    context.drawImage(
      elementWithCanvas.canvas!,
      (x1 + appState.scrollX) * window.devicePixelRatio -
        (padding * elementWithCanvas.scale) / elementWithCanvas.scale,
      (y1 + appState.scrollY) * window.devicePixelRatio -
        (padding * elementWithCanvas.scale) / elementWithCanvas.scale,
      elementWithCanvas.canvas!.width / elementWithCanvas.scale,
      elementWithCanvas.canvas!.height / elementWithCanvas.scale,
    );

    if (
      import.meta.env.VITE_APP_DEBUG_ENABLE_TEXT_CONTAINER_BOUNDING_BOX ===
        "true" &&
      hasBoundTextElement(element)
    ) {
      const textElement = getBoundTextElement(
        element,
        allElementsMap,
      ) as ExcalidrawTextElementWithContainer;
      const coords = getContainerCoords(element);
      context.strokeStyle = "#c92a2a";
      context.lineWidth = 3;
      context.strokeRect(
        (coords.x + appState.scrollX) * window.devicePixelRatio,
        (coords.y + appState.scrollY) * window.devicePixelRatio,
        getBoundTextMaxWidth(element, textElement) * window.devicePixelRatio,
        getBoundTextMaxHeight(element, textElement) * window.devicePixelRatio,
      );
    }
  }
  context.restore();

  // Clear the nested element we appended to the DOM
};

export const renderSelectionElement = (
  element: NonDeletedExcalidrawElement,
  context: CanvasRenderingContext2D,
  appState: InteractiveCanvasAppState,
  selectionColor: InteractiveCanvasRenderConfig["selectionColor"],
) => {
  context.save();
  context.translate(element.x + appState.scrollX, element.y + appState.scrollY);
  context.fillStyle = "rgba(0, 0, 200, 0.04)";

  // render from 0.5px offset  to get 1px wide line
  // https://stackoverflow.com/questions/7530593/html5-canvas-and-line-width/7531540#7531540
  // TODO can be be improved by offseting to the negative when user selects
  // from right to left
  const offset = 0.5 / appState.zoom.value;

  context.fillRect(offset, offset, element.width, element.height);
  context.lineWidth = 1 / appState.zoom.value;
  context.strokeStyle = selectionColor;
  context.strokeRect(offset, offset, element.width, element.height);

  context.restore();
};

export const renderElement = (
  element: NonDeletedExcalidrawElement,
  elementsMap: RenderableElementsMap,
  allElementsMap: NonDeletedSceneElementsMap,
  rc: RoughCanvas,
  context: CanvasRenderingContext2D,
  renderConfig: StaticCanvasRenderConfig,
  appState: StaticCanvasAppState | InteractiveCanvasAppState,
) => {
  const reduceAlphaForSelection =
    appState.openDialog?.name === "elementLinkSelector" &&
    !appState.selectedElementIds[element.id] &&
    !appState.hoveredElementIds[element.id];

  context.globalAlpha = getRenderOpacity(
    element,
    getContainingFrame(element, elementsMap),
    renderConfig.elementsPendingErasure,
    renderConfig.pendingFlowchartNodes,
    reduceAlphaForSelection ? DEFAULT_REDUCED_GLOBAL_ALPHA : 1,
  );

  switch (element.type) {
    case "magicframe":
    case "frame": {
      if (appState.frameRendering.enabled && appState.frameRendering.outline) {
        context.save();
        context.translate(
          element.x + appState.scrollX,
          element.y + appState.scrollY,
        );
        context.fillStyle = "rgba(0, 0, 200, 0.04)";

        context.lineWidth = FRAME_STYLE.strokeWidth / appState.zoom.value;
        context.strokeStyle =
          appState.theme === THEME.DARK
            ? applyDarkModeFilter(FRAME_STYLE.strokeColor)
            : FRAME_STYLE.strokeColor;

        // TODO change later to only affect AI frames
        if (isMagicFrameElement(element)) {
          context.strokeStyle =
            appState.theme === THEME.LIGHT
              ? "#7affd7"
              : applyDarkModeFilter("#1d8264");
        }

        if (FRAME_STYLE.radius && context.roundRect) {
          context.beginPath();
          context.roundRect(
            0,
            0,
            element.width,
            element.height,
            FRAME_STYLE.radius / appState.zoom.value,
          );
          context.stroke();
          context.closePath();
        } else {
          context.strokeRect(0, 0, element.width, element.height);
        }

        context.restore();
      }
      break;
    }
    case "freedraw": {
      if (renderConfig.isExporting) {
        const [x1, y1, x2, y2] = getElementAbsoluteCoords(element, elementsMap);
        const cx = (x1 + x2) / 2 + appState.scrollX;
        const cy = (y1 + y2) / 2 + appState.scrollY;
        const shiftX = (x2 - x1) / 2 - (element.x - x1);
        const shiftY = (y2 - y1) / 2 - (element.y - y1);
        context.save();
        context.translate(cx, cy);
        context.rotate(element.angle);
        context.translate(-shiftX, -shiftY);
        drawElementOnCanvas(element, rc, context, renderConfig);
        context.restore();
      } else {
        const elementWithCanvas = generateElementWithCanvas(
          element,
          allElementsMap,
          renderConfig,
          appState,
        );
        if (!elementWithCanvas) {
          return;
        }

        drawElementFromCanvas(
          elementWithCanvas,
          context,
          renderConfig,
          appState,
          allElementsMap,
        );
      }

      break;
    }
    case "rectangle":
    case "diamond":
    case "ellipse":
    case "line":
    case "arrow":
    case "image":
    case "text":
    case "iframe":
    case "embeddable": {
      if (renderConfig.isExporting) {
        const [x1, y1, x2, y2] = getElementAbsoluteCoords(element, elementsMap);
        const cx = (x1 + x2) / 2 + appState.scrollX;
        const cy = (y1 + y2) / 2 + appState.scrollY;
        let shiftX = (x2 - x1) / 2 - (element.x - x1);
        let shiftY = (y2 - y1) / 2 - (element.y - y1);
        if (isTextElement(element)) {
          const container = getContainerElement(element, elementsMap);
          if (isArrowElement(container)) {
            const boundTextCoords =
              LinearElementEditor.getBoundTextElementPosition(
                container,
                element as ExcalidrawTextElementWithContainer,
                elementsMap,
              );
            shiftX = (x2 - x1) / 2 - (boundTextCoords.x - x1);
            shiftY = (y2 - y1) / 2 - (boundTextCoords.y - y1);
          }
        }
        context.save();
        context.translate(cx, cy);

        const boundTextElement = getBoundTextElement(element, elementsMap);

        if (isArrowElement(element) && boundTextElement) {
          const tempCanvas = document.createElement("canvas");

          const tempCanvasContext = tempCanvas.getContext("2d")!;

          // Take max dimensions of arrow canvas so that when canvas is rotated
          // the arrow doesn't get clipped
          const maxDim = Math.max(distance(x1, x2), distance(y1, y2));
          const padding = getCanvasPadding(element);
          tempCanvas.width =
            maxDim * appState.exportScale + padding * 10 * appState.exportScale;
          tempCanvas.height =
            maxDim * appState.exportScale + padding * 10 * appState.exportScale;

          tempCanvasContext.translate(
            tempCanvas.width / 2,
            tempCanvas.height / 2,
          );
          tempCanvasContext.scale(appState.exportScale, appState.exportScale);

          // Shift the canvas to left most point of the arrow
          shiftX = element.width / 2 - (element.x - x1);
          shiftY = element.height / 2 - (element.y - y1);

          tempCanvasContext.rotate(element.angle);
          const tempRc = rough.canvas(tempCanvas);

          tempCanvasContext.translate(-shiftX, -shiftY);

          drawElementOnCanvas(element, tempRc, tempCanvasContext, renderConfig);

          tempCanvasContext.translate(shiftX, shiftY);

          tempCanvasContext.rotate(-element.angle);

          // Shift the canvas to center of bound text
          const [, , , , boundTextCx, boundTextCy] = getElementAbsoluteCoords(
            boundTextElement,
            elementsMap,
          );
          const boundTextShiftX = (x1 + x2) / 2 - boundTextCx;
          const boundTextShiftY = (y1 + y2) / 2 - boundTextCy;
          tempCanvasContext.translate(-boundTextShiftX, -boundTextShiftY);

          // Clear the bound text area
          tempCanvasContext.clearRect(
            -boundTextElement.width / 2,
            -boundTextElement.height / 2,
            boundTextElement.width,
            boundTextElement.height,
          );
          context.scale(1 / appState.exportScale, 1 / appState.exportScale);
          context.drawImage(
            tempCanvas,
            -tempCanvas.width / 2,
            -tempCanvas.height / 2,
            tempCanvas.width,
            tempCanvas.height,
          );
        } else {
          context.rotate(element.angle);

          if (element.type === "image") {
            // note: scale must be applied *after* rotating
            context.scale(element.scale[0], element.scale[1]);
          }

          context.translate(-shiftX, -shiftY);
          drawElementOnCanvas(element, rc, context, renderConfig);
        }

        context.restore();
        // not exporting → optimized rendering (cache & render from element
        // canvases)
      } else {
        const elementWithCanvas = generateElementWithCanvas(
          element,
          allElementsMap,
          renderConfig,
          appState,
        );

        if (!elementWithCanvas) {
          return;
        }

        const currentImageSmoothingStatus = context.imageSmoothingEnabled;

        if (
          // do not disable smoothing during zoom as blurry shapes look better
          // on low resolution (while still zooming in) than sharp ones
          !appState?.shouldCacheIgnoreZoom &&
          // angle is 0 -> always disable smoothing
          (!element.angle ||
            // or check if angle is a right angle in which case we can still
            // disable smoothing without adversely affecting the result
            // We need less-than comparison because of FP artihmetic
            isRightAngleRads(element.angle))
        ) {
          // Disabling smoothing makes output much sharper, especially for
          // text. Unless for non-right angles, where the aliasing is really
          // terrible on Chromium.
          //
          // Note that `context.imageSmoothingQuality="high"` has almost
          // zero effect.
          //
          context.imageSmoothingEnabled = false;
        }

        if (
          element.id === appState.croppingElementId &&
          isImageElement(elementWithCanvas.element) &&
          elementWithCanvas.element.crop !== null
        ) {
          context.save();
          context.globalAlpha = 0.1;

          const uncroppedElementCanvas = generateElementCanvas(
            getUncroppedImageElement(elementWithCanvas.element, elementsMap),
            allElementsMap,
            appState.zoom,
            renderConfig,
            appState,
          );

          if (uncroppedElementCanvas) {
            drawElementFromCanvas(
              uncroppedElementCanvas,
              context,
              renderConfig,
              appState,
              allElementsMap,
            );
          }

          context.restore();
        }

        drawElementFromCanvas(
          elementWithCanvas,
          context,
          renderConfig,
          appState,
          allElementsMap,
        );

        // reset
        context.imageSmoothingEnabled = currentImageSmoothingStatus;
      }
      break;
    }
    default: {
      // @ts-ignore
      throw new Error(`Unimplemented type ${element.type}`);
    }
  }

  context.globalAlpha = 1;
};

export function getFreedrawOutlineAsSegments(
  element: ExcalidrawFreeDrawElement,
  points: [number, number][],
  elementsMap: ElementsMap,
) {
  const bounds = getElementBounds(
    {
      ...element,
      angle: 0 as Radians,
    },
    elementsMap,
  );
  const center = pointFrom<GlobalPoint>(
    (bounds[0] + bounds[2]) / 2,
    (bounds[1] + bounds[3]) / 2,
  );

  invariant(points.length >= 2, "Freepath outline must have at least 2 points");

  return points.slice(2).reduce(
    (acc, curr) => {
      acc.push(
        lineSegment<GlobalPoint>(
          acc[acc.length - 1][1],
          pointRotateRads(
            pointFrom<GlobalPoint>(curr[0] + element.x, curr[1] + element.y),
            center,
            element.angle,
          ),
        ),
      );
      return acc;
    },
    [
      lineSegment<GlobalPoint>(
        pointRotateRads(
          pointFrom<GlobalPoint>(
            points[0][0] + element.x,
            points[0][1] + element.y,
          ),
          center,
          element.angle,
        ),
        pointRotateRads(
          pointFrom<GlobalPoint>(
            points[1][0] + element.x,
            points[1][1] + element.y,
          ),
          center,
          element.angle,
        ),
      ),
    ],
  );
}
