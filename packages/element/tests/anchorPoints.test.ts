import { arrayToMap } from "@excalidraw/common";

import { pointFrom } from "@excalidraw/math";

import { newElement } from "../src/newElement";
import {
  addBindableElementAnchorPoint,
  findClosestBindableElementAnchorPoint,
  getBindableElementAnchorPoints,
  removeBindableElementAnchorPoint,
  updateBindableElementAnchorPoint,
} from "../src/anchorPoints";

describe("rectangle anchor points", () => {
  it("returns the default four anchors when the rectangle was not customized", () => {
    const rectangle = newElement({
      type: "rectangle",
      x: 100,
      y: 100,
      width: 200,
      height: 100,
    });

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
    });

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
    });

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
    };

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
    });

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
});
