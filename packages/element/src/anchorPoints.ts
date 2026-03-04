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

const isRectangleAnchorPoint = (
  fixedPoint: unknown,
): fixedPoint is FixedPoint =>
  Array.isArray(fixedPoint) &&
  fixedPoint.length === 2 &&
  fixedPoint.every(
    (coord) => typeof coord === "number" && Number.isFinite(coord),
  );

const normalizeAnchorPoint = (fixedPoint: FixedPoint): FixedPoint => [
  clamp(fixedPoint[0], 0, 1),
  clamp(fixedPoint[1], 0, 1),
];

const fixedPointsEqual = (left: FixedPoint, right: FixedPoint): boolean => {
  const normalizedLeft = normalizeAnchorPoint(left);
  const normalizedRight = normalizeAnchorPoint(right);

  return (
    normalizedLeft[0] === normalizedRight[0] &&
    normalizedLeft[1] === normalizedRight[1]
  );
};

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

export const getCustomBindableElementAnchorPoints = (
  element: ExcalidrawBindableElement,
): FixedPoint[] =>
  getBindableElementAnchorPoints(element).filter(
    (fixedPoint) =>
      !DEFAULT_RECTANGLE_ANCHOR_POINTS.some((defaultAnchorPoint) =>
        fixedPointsEqual(defaultAnchorPoint, fixedPoint),
      ),
  );

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
    anchorPoints: anchorPoints.filter(
      (_, anchorIndex) => anchorIndex !== index,
    ),
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

  let closestAnchor: {
    fixedPoint: FixedPoint;
    index: number;
    point: GlobalPoint;
    distance: number;
  } | null = null;

  for (const [index, fixedPoint] of storedAnchorPoints.entries()) {
    const globalAnchorPoint = getGlobalAnchorPointForBindableElement(
      element,
      fixedPoint,
      elementsMap,
    );
    const distance = pointDistance(point, globalAnchorPoint);

    if (distance > threshold) {
      continue;
    }

    if (!closestAnchor || distance < closestAnchor.distance) {
      closestAnchor = {
        fixedPoint,
        index,
        point: globalAnchorPoint,
        distance,
      };
    }
  }

  if (!closestAnchor) {
    return null;
  }

  return {
    fixedPoint: closestAnchor.fixedPoint,
    index: closestAnchor.index,
    point: closestAnchor.point,
  };
};

export const findClosestCustomBindableElementAnchorPoint = (
  element: ExcalidrawBindableElement,
  point: GlobalPoint,
  elementsMap: ElementsMap,
  threshold: number,
): {
  fixedPoint: FixedPoint;
  index: number;
  point: GlobalPoint;
} | null => {
  const anchorPoints = getBindableElementAnchorPoints(element);

  let closestAnchor: {
    fixedPoint: FixedPoint;
    index: number;
    point: GlobalPoint;
    distance: number;
  } | null = null;

  for (const [index, fixedPoint] of anchorPoints.entries()) {
    if (
      DEFAULT_RECTANGLE_ANCHOR_POINTS.some((defaultAnchorPoint) =>
        fixedPointsEqual(defaultAnchorPoint, fixedPoint),
      )
    ) {
      continue;
    }

    const globalAnchorPoint = getGlobalAnchorPointForBindableElement(
      element,
      fixedPoint,
      elementsMap,
    );
    const distance = pointDistance(point, globalAnchorPoint);

    if (distance > threshold) {
      continue;
    }

    if (!closestAnchor || distance < closestAnchor.distance) {
      closestAnchor = {
        fixedPoint,
        index,
        point: globalAnchorPoint,
        distance,
      };
    }
  }

  if (!closestAnchor) {
    return null;
  }

  return {
    fixedPoint: closestAnchor.fixedPoint,
    index: closestAnchor.index,
    point: closestAnchor.point,
  };
};

export const findClosestBindableElementEditorAnchorPoint = (
  element: ExcalidrawBindableElement,
  point: GlobalPoint,
  elementsMap: ElementsMap,
  threshold: number,
): {
  fixedPoint: FixedPoint;
  index: number;
  point: GlobalPoint;
} | null => {
  const anchorPoints = getBindableElementAnchorPoints(element);

  let closestAnchor: {
    fixedPoint: FixedPoint;
    index: number;
    point: GlobalPoint;
    distance: number;
  } | null = null;

  for (const [index, fixedPoint] of anchorPoints.entries()) {
    const globalAnchorPoint = getGlobalAnchorPointForBindableElement(
      element,
      fixedPoint,
      elementsMap,
    );
    const distance = pointDistance(point, globalAnchorPoint);

    if (distance > threshold) {
      continue;
    }

    if (!closestAnchor || distance < closestAnchor.distance) {
      closestAnchor = {
        fixedPoint,
        index,
        point: globalAnchorPoint,
        distance,
      };
    }
  }

  if (!closestAnchor) {
    return null;
  }

  return {
    fixedPoint: closestAnchor.fixedPoint,
    index: closestAnchor.index,
    point: closestAnchor.point,
  };
};

export const projectPointToBindableElementAnchor = (
  element: ExcalidrawBindableElement,
  point: GlobalPoint,
  elementsMap: ElementsMap,
): {
  fixedPoint: FixedPoint;
  point: GlobalPoint;
} | null => {
  if (element.type !== "rectangle" || !element.width || !element.height) {
    return null;
  }

  const elementCenter = elementCenterPoint(element, elementsMap);
  const nonRotatedPoint = pointRotateRads(
    point,
    elementCenter,
    -element.angle as Radians,
  );

  const ratioX = clamp((nonRotatedPoint[0] - element.x) / element.width, 0, 1);
  const ratioY = clamp((nonRotatedPoint[1] - element.y) / element.height, 0, 1);

  const distances = [
    { side: "top", distance: Math.abs(nonRotatedPoint[1] - element.y) },
    {
      side: "right",
      distance: Math.abs(nonRotatedPoint[0] - (element.x + element.width)),
    },
    {
      side: "bottom",
      distance: Math.abs(nonRotatedPoint[1] - (element.y + element.height)),
    },
    { side: "left", distance: Math.abs(nonRotatedPoint[0] - element.x) },
  ] as const;

  const nearestSide = distances.reduce((closest, current) =>
    current.distance < closest.distance ? current : closest,
  );

  const fixedPoint =
    nearestSide.side === "top"
      ? ([ratioX, 0] as FixedPoint)
      : nearestSide.side === "right"
      ? ([1, ratioY] as FixedPoint)
      : nearestSide.side === "bottom"
      ? ([ratioX, 1] as FixedPoint)
      : ([0, ratioY] as FixedPoint);

  return {
    fixedPoint,
    point: getGlobalAnchorPointForBindableElement(
      element,
      fixedPoint,
      elementsMap,
    ),
  };
};
