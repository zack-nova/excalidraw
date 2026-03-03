import {
  clamp,
  pointDistance,
  pointFrom,
  pointRotateRads,
  type GlobalPoint,
} from "@excalidraw/math";

import type { Radians } from "@excalidraw/math";

import { elementCenterPoint } from "./bounds";

import type {
  ElementsMap,
  ExcalidrawBindableElement,
  FixedPoint,
} from "./types";

const DEFAULT_RECTANGLE_ANCHOR_POINTS: readonly FixedPoint[] = [
  [0.5, 0],
  [1, 0.5],
  [0.5, 1],
  [0, 0.5],
];

const isRectangleAnchorPoint = (fixedPoint: unknown): fixedPoint is FixedPoint =>
  Array.isArray(fixedPoint) &&
  fixedPoint.length === 2 &&
  fixedPoint.every((coord) => typeof coord === "number" && Number.isFinite(coord));

const normalizeAnchorPoint = (fixedPoint: FixedPoint): FixedPoint => [
  clamp(fixedPoint[0], 0, 1),
  clamp(fixedPoint[1], 0, 1),
];

const getStoredAnchorPoints = (
  element: ExcalidrawBindableElement,
): FixedPoint[] | null => {
  const anchorPoints = element.customData?.anchorPoints;
  if (!Array.isArray(anchorPoints)) {
    return null;
  }

  return anchorPoints
    .filter(isRectangleAnchorPoint)
    .map((anchorPoint) => normalizeAnchorPoint(anchorPoint));
};

export const getBindableElementAnchorPoints = (
  element: ExcalidrawBindableElement,
): FixedPoint[] => {
  const storedAnchorPoints = getStoredAnchorPoints(element);

  if (storedAnchorPoints) {
    return storedAnchorPoints;
  }

  return element.type === "rectangle"
    ? DEFAULT_RECTANGLE_ANCHOR_POINTS.map((anchorPoint) => [...anchorPoint])
    : [];
};

export const addBindableElementAnchorPoint = (
  element: ExcalidrawBindableElement,
  fixedPoint: FixedPoint,
) => {
  const anchorPoints = getBindableElementAnchorPoints(element);

  return {
    ...(element.customData || {}),
    anchorPoints: [...anchorPoints, normalizeAnchorPoint(fixedPoint)],
  };
};

export const updateBindableElementAnchorPoint = (
  element: ExcalidrawBindableElement,
  index: number,
  fixedPoint: FixedPoint,
) => {
  const anchorPoints = getBindableElementAnchorPoints(element);

  if (index < 0 || index >= anchorPoints.length) {
    return {
      ...(element.customData || {}),
      anchorPoints,
    };
  }

  return {
    ...(element.customData || {}),
    anchorPoints: anchorPoints.map((anchorPoint, anchorIndex) =>
      anchorIndex === index ? normalizeAnchorPoint(fixedPoint) : anchorPoint,
    ),
  };
};

export const removeBindableElementAnchorPoint = (
  element: ExcalidrawBindableElement,
  index: number,
) => {
  const anchorPoints = getBindableElementAnchorPoints(element);

  return {
    ...(element.customData || {}),
    anchorPoints: anchorPoints.filter((_, anchorIndex) => anchorIndex !== index),
  };
};

export const getGlobalAnchorPointForBindableElement = (
  element: ExcalidrawBindableElement,
  fixedPoint: FixedPoint,
  elementsMap: ElementsMap,
): GlobalPoint => {
  const [fixedX, fixedY] = normalizeAnchorPoint(fixedPoint);

  return pointRotateRads(
    pointFrom(
      element.x + element.width * fixedX,
      element.y + element.height * fixedY,
    ),
    elementCenterPoint(element, elementsMap),
    element.angle as Radians,
  );
};

export const findClosestBindableElementAnchorPoint = (
  element: ExcalidrawBindableElement,
  point: GlobalPoint,
  elementsMap: ElementsMap,
  threshold: number,
): {
  fixedPoint: FixedPoint;
  index: number;
  point: GlobalPoint;
} | null => {
  const storedAnchorPoints = getStoredAnchorPoints(element);

  if (!storedAnchorPoints?.length) {
    return null;
  }

  let closestAnchor:
    | {
        fixedPoint: FixedPoint;
        index: number;
        point: GlobalPoint;
        distance: number;
      }
    | null = null;

  storedAnchorPoints.forEach((fixedPoint, index) => {
    const globalAnchorPoint = getGlobalAnchorPointForBindableElement(
      element,
      fixedPoint,
      elementsMap,
    );
    const distance = pointDistance(point, globalAnchorPoint);

    if (distance > threshold) {
      return;
    }

    if (!closestAnchor || distance < closestAnchor.distance) {
      closestAnchor = {
        fixedPoint,
        index,
        point: globalAnchorPoint,
        distance,
      };
    }
  });

  if (!closestAnchor) {
    return null;
  }

  return {
    fixedPoint: closestAnchor.fixedPoint,
    index: closestAnchor.index,
    point: closestAnchor.point,
  };
};
