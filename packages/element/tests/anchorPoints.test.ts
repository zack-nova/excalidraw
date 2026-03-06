import { arrayToMap } from "@excalidraw/common";

import { pointFrom } from "@excalidraw/math";

import {
  newElement,
  newFrameElement,
  newImageElement,
} from "../src/newElement";
import {
  addBindableElementAnchorPoint,
  getCustomBindableElementAnchorPoints,
  findClosestBindableElementAnchorPoint,
  getBindableElementAnchorPoints,
  projectPointToBindableElementAnchor,
  removeBindableElementAnchorPoint,
  setBindableElementAnchorsWhenUnselected,
  supportsBindableElementAnchorPoints,
  shouldShowBindableElementAnchorsWhenUnselected,
  updateBindableElementAnchorPoint,
} from "../src/anchorPoints";

import type { ExcalidrawBindableElement } from "../src/types";

describe("rectangle anchor points", () => {
  it("returns the default four anchors when the rectangle was not customized", () => {
    const rectangle = newElement({
      type: "rectangle",
      x: 100,
      y: 100,
      width: 200,
      height: 100,
    }) as ExcalidrawBindableElement;

    expect(getBindableElementAnchorPoints(rectangle)).toEqual([
      [0.5, 0],
      [1, 0.5],
      [0.5, 1],
      [0, 0.5],
    ]);
  });

  it("materializes the default anchors before appending a new anchor", () => {
    const rectangle = newElement({
      type: "rectangle",
      x: 100,
      y: 100,
      width: 200,
      height: 100,
    }) as ExcalidrawBindableElement;

    expect(addBindableElementAnchorPoint(rectangle, [0.25, 0])).toEqual({
      anchorPoints: [
        [0.5, 0],
        [1, 0.5],
        [0.5, 1],
        [0, 0.5],
        [0.25, 0],
      ],
    });
  });

  it("updates and removes materialized anchors by index", () => {
    const rectangle = newElement({
      type: "rectangle",
      x: 100,
      y: 100,
      width: 200,
      height: 100,
      customData: {
        anchorPoints: [
          [0.5, 0],
          [1, 0.5],
          [0.5, 1],
          [0, 0.5],
          [0.25, 0],
        ],
      },
    }) as ExcalidrawBindableElement;

    const updatedCustomData = updateBindableElementAnchorPoint(
      rectangle,
      4,
      [0.75, 0],
    );

    expect(updatedCustomData).toEqual({
      anchorPoints: [
        [0.5, 0],
        [1, 0.5],
        [0.5, 1],
        [0, 0.5],
        [0.75, 0],
      ],
    });

    const updatedRectangle = {
      ...rectangle,
      customData: updatedCustomData,
    } as ExcalidrawBindableElement;

    expect(removeBindableElementAnchorPoint(updatedRectangle, 1)).toEqual({
      anchorPoints: [
        [0.5, 0],
        [0.5, 1],
        [0, 0.5],
        [0.75, 0],
      ],
    });
  });

  it("finds the closest custom anchor on the rectangle", () => {
    const rectangle = newElement({
      type: "rectangle",
      x: 100,
      y: 100,
      width: 200,
      height: 100,
      customData: {
        anchorPoints: [[0.25, 0]],
      },
    }) as ExcalidrawBindableElement;

    const anchor = findClosestBindableElementAnchorPoint(
      rectangle,
      pointFrom(152, 96),
      arrayToMap([rectangle]),
      16,
    );

    expect(anchor).toEqual({
      fixedPoint: [0.25, 0],
      index: 0,
      point: pointFrom(150, 100),
    });
  });

  it("returns only non-default rectangle anchors for passive display", () => {
    const rectangle = newElement({
      type: "rectangle",
      x: 100,
      y: 100,
      width: 200,
      height: 100,
      customData: {
        anchorPoints: [
          [0.5, 0],
          [1, 0.5],
          [0.5, 1],
          [0, 0.5],
          [0.25, 0],
        ],
      },
    }) as ExcalidrawBindableElement;

    expect(getCustomBindableElementAnchorPoints(rectangle)).toEqual([
      [0.25, 0],
    ]);
  });

  it("treats moved default anchors as custom anchors", () => {
    const rectangle = newElement({
      type: "rectangle",
      x: 100,
      y: 100,
      width: 200,
      height: 100,
      customData: {
        anchorPoints: [
          [0.25, 0],
          [1, 0.5],
          [0.5, 1],
          [0, 0.5],
        ],
      },
    }) as ExcalidrawBindableElement;

    expect(getCustomBindableElementAnchorPoints(rectangle)).toEqual([
      [0.25, 0],
    ]);
  });

  it("hides anchors when unselected by default for normal shapes", () => {
    const rectangle = newElement({
      type: "rectangle",
      x: 100,
      y: 100,
      width: 200,
      height: 100,
    }) as ExcalidrawBindableElement;

    expect(shouldShowBindableElementAnchorsWhenUnselected(rectangle)).toBe(
      false,
    );
  });

  it("shows anchors when unselected by default for engineering components", () => {
    const rectangle = newElement({
      type: "rectangle",
      x: 100,
      y: 100,
      width: 200,
      height: 100,
      customData: {
        isEngineeringComponent: true,
      },
    }) as ExcalidrawBindableElement;

    expect(shouldShowBindableElementAnchorsWhenUnselected(rectangle)).toBe(
      true,
    );
  });

  it("stores unselected anchor visibility overrides relative to engineering defaults", () => {
    const rectangle = newElement({
      type: "rectangle",
      x: 100,
      y: 100,
      width: 200,
      height: 100,
      customData: {
        anchorPoints: [[0.25, 0]],
      },
    }) as ExcalidrawBindableElement;
    const engineeringRectangle = newElement({
      type: "rectangle",
      x: 100,
      y: 100,
      width: 200,
      height: 100,
      customData: {
        isEngineeringComponent: true,
        anchorPoints: [[0.25, 0]],
      },
    }) as ExcalidrawBindableElement;

    expect(setBindableElementAnchorsWhenUnselected(rectangle, false)).toEqual({
      anchorPoints: [[0.25, 0]],
    });

    expect(setBindableElementAnchorsWhenUnselected(rectangle, true)).toEqual({
      anchorPoints: [[0.25, 0]],
      showAnchorsWhenUnselected: true,
    });

    expect(
      setBindableElementAnchorsWhenUnselected(engineeringRectangle, true),
    ).toEqual({
      isEngineeringComponent: true,
      anchorPoints: [[0.25, 0]],
    });

    expect(
      setBindableElementAnchorsWhenUnselected(engineeringRectangle, false),
    ).toEqual({
      isEngineeringComponent: true,
      anchorPoints: [[0.25, 0]],
      showAnchorsWhenUnselected: false,
    });
  });

  it("returns the default four anchors for ellipse, diamond, and image", () => {
    const ellipse = newElement({
      type: "ellipse",
      x: 100,
      y: 100,
      width: 200,
      height: 100,
    }) as ExcalidrawBindableElement;
    const diamond = newElement({
      type: "diamond",
      x: 100,
      y: 100,
      width: 200,
      height: 100,
    }) as ExcalidrawBindableElement;
    const image = newImageElement({
      type: "image",
      x: 100,
      y: 100,
      width: 200,
      height: 100,
      fileId: null,
      status: "pending",
      scale: [1, 1],
    }) as ExcalidrawBindableElement;

    expect(getBindableElementAnchorPoints(ellipse)).toEqual([
      [0.5, 0],
      [1, 0.5],
      [0.5, 1],
      [0, 0.5],
    ]);
    expect(getBindableElementAnchorPoints(diamond)).toEqual([
      [0.5, 0],
      [1, 0.5],
      [0.5, 1],
      [0, 0.5],
    ]);
    expect(getBindableElementAnchorPoints(image)).toEqual([
      [0.5, 0],
      [1, 0.5],
      [0.5, 1],
      [0, 0.5],
    ]);
  });

  it("projects points to ellipse and diamond outlines when adding anchors", () => {
    const ellipse = newElement({
      type: "ellipse",
      x: 100,
      y: 100,
      width: 100,
      height: 100,
    }) as ExcalidrawBindableElement;
    const diamond = newElement({
      type: "diamond",
      x: 100,
      y: 100,
      width: 100,
      height: 100,
    }) as ExcalidrawBindableElement;

    const ellipseProjection = projectPointToBindableElementAnchor(
      ellipse,
      pointFrom(185.35533905932738, 114.64466094067262),
      arrayToMap([ellipse]),
    );
    const diamondProjection = projectPointToBindableElementAnchor(
      diamond,
      pointFrom(175, 125),
      arrayToMap([diamond]),
    );

    expect(ellipseProjection?.fixedPoint[0]).toBeCloseTo(0.85355, 4);
    expect(ellipseProjection?.fixedPoint[1]).toBeCloseTo(0.14645, 4);
    expect(diamondProjection?.fixedPoint).toEqual([0.75, 0.25]);
  });

  it("only enables anchor editing for rectangle, ellipse, diamond, and image", () => {
    const rectangle = newElement({
      type: "rectangle",
      x: 100,
      y: 100,
      width: 100,
      height: 100,
    }) as ExcalidrawBindableElement;
    const ellipse = newElement({
      type: "ellipse",
      x: 100,
      y: 100,
      width: 100,
      height: 100,
    }) as ExcalidrawBindableElement;
    const diamond = newElement({
      type: "diamond",
      x: 100,
      y: 100,
      width: 100,
      height: 100,
    }) as ExcalidrawBindableElement;
    const image = newImageElement({
      type: "image",
      x: 100,
      y: 100,
      width: 100,
      height: 100,
      fileId: null,
      status: "pending",
      scale: [1, 1],
    }) as ExcalidrawBindableElement;
    const frame = newFrameElement({
      x: 100,
      y: 100,
      width: 100,
      height: 100,
    }) as ExcalidrawBindableElement;

    expect(supportsBindableElementAnchorPoints(rectangle)).toBe(true);
    expect(supportsBindableElementAnchorPoints(ellipse)).toBe(true);
    expect(supportsBindableElementAnchorPoints(diamond)).toBe(true);
    expect(supportsBindableElementAnchorPoints(image)).toBe(true);
    expect(supportsBindableElementAnchorPoints(frame)).toBe(false);
  });
});
