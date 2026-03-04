import { arrayToMap } from "@excalidraw/common";

import { pointFrom, type GlobalPoint } from "@excalidraw/math";

import { newElement, newImageElement } from "@excalidraw/element";

import type { ExcalidrawBindableElement } from "@excalidraw/element/types";

import {
  getAnchorPointHandleStatesForBindableElement,
  getBindingHighlightPointsForBindableElement,
} from "../renderer/interactiveScene";

describe("interactive binding highlights", () => {
  it("uses custom rectangle anchors as highlight points", () => {
    const rectangle = newElement({
      type: "rectangle",
      x: 100,
      y: 100,
      width: 100,
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

    expect(
      getBindingHighlightPointsForBindableElement(
        rectangle,
        arrayToMap([rectangle]),
      ),
    ).toContainEqual(pointFrom(125, 100));
  });

  it("uses custom diamond anchors as highlight points", () => {
    const diamond = newElement({
      type: "diamond",
      x: 100,
      y: 100,
      width: 100,
      height: 100,
      customData: {
        anchorPoints: [[0.75, 0.25]],
      },
    }) as ExcalidrawBindableElement;

    expect(
      getBindingHighlightPointsForBindableElement(
        diamond,
        arrayToMap([diamond]),
      ),
    ).toContainEqual(pointFrom(175, 125));
  });

  it("shows default rectangle anchors as passive handles and marks hover", () => {
    const rectangle = newElement({
      type: "rectangle",
      x: 100,
      y: 100,
      width: 100,
      height: 100,
    }) as ExcalidrawBindableElement;

    expect(
      getAnchorPointHandleStatesForBindableElement(
        rectangle,
        arrayToMap([rectangle]),
        {
          isEditing: false,
          isSelected: false,
          pointerCoords: pointFrom<GlobalPoint>(149, 100),
          selectedAnchorPointIndex: null,
          zoomValue: 1,
          hoveredAnchorElementId: rectangle.id,
          hoveredAnchorPointIndex: 0,
        },
      ),
    ).toEqual([
      expect.objectContaining({
        index: 0,
        fixedPoint: [0.5, 0],
        point: pointFrom(150, 100),
        isHovered: true,
        isSelected: false,
        isPassive: true,
      }),
      expect.objectContaining({ index: 1, fixedPoint: [1, 0.5] }),
      expect.objectContaining({ index: 2, fixedPoint: [0.5, 1] }),
      expect.objectContaining({ index: 3, fixedPoint: [0, 0.5] }),
    ]);
  });

  it("shows custom anchors alongside the default passive anchors", () => {
    const rectangle = newElement({
      type: "rectangle",
      x: 100,
      y: 100,
      width: 100,
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

    expect(
      getAnchorPointHandleStatesForBindableElement(
        rectangle,
        arrayToMap([rectangle]),
        {
          isEditing: false,
          isSelected: false,
          pointerCoords: pointFrom<GlobalPoint>(124, 100),
          selectedAnchorPointIndex: null,
          zoomValue: 1,
          hoveredAnchorElementId: rectangle.id,
          hoveredAnchorPointIndex: 4,
        },
      ),
    ).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          index: 0,
          fixedPoint: [0.5, 0],
          isPassive: true,
        }),
        expect.objectContaining({
          index: 1,
          fixedPoint: [1, 0.5],
          isPassive: true,
        }),
        expect.objectContaining({
          index: 2,
          fixedPoint: [0.5, 1],
          isPassive: true,
        }),
        expect.objectContaining({
          index: 3,
          fixedPoint: [0, 0.5],
          isPassive: true,
        }),
        expect.objectContaining({
          index: 4,
          fixedPoint: [0.25, 0],
          point: pointFrom(125, 100),
          isHovered: true,
          isSelected: false,
          isPassive: true,
        }),
      ]),
    );
  });

  it("shows all rectangle anchors in editing mode", () => {
    const rectangle = newElement({
      type: "rectangle",
      x: 100,
      y: 100,
      width: 100,
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

    expect(
      getAnchorPointHandleStatesForBindableElement(
        rectangle,
        arrayToMap([rectangle]),
        {
          isEditing: true,
          isSelected: true,
          pointerCoords: null,
          selectedAnchorPointIndex: 4,
          zoomValue: 1,
          hoveredAnchorElementId: null,
          hoveredAnchorPointIndex: null,
        },
      ),
    ).toHaveLength(5);
  });

  it("only marks the editing element anchor as selected", () => {
    const rectangle = newElement({
      type: "rectangle",
      x: 100,
      y: 100,
      width: 100,
      height: 100,
    }) as ExcalidrawBindableElement;
    const ellipse = newElement({
      type: "ellipse",
      x: 300,
      y: 100,
      width: 100,
      height: 100,
    }) as ExcalidrawBindableElement;
    const elementsMap = arrayToMap([rectangle, ellipse]);

    expect(
      getAnchorPointHandleStatesForBindableElement(rectangle, elementsMap, {
        isEditing: true,
        isSelected: true,
        pointerCoords: null,
        selectedAnchorPointIndex: 0,
        zoomValue: 1,
        hoveredAnchorElementId: null,
        hoveredAnchorPointIndex: null,
      })[0]?.isSelected,
    ).toBe(true);

    expect(
      getAnchorPointHandleStatesForBindableElement(ellipse, elementsMap, {
        isEditing: false,
        isSelected: false,
        pointerCoords: null,
        selectedAnchorPointIndex: 0,
        zoomValue: 1,
        hoveredAnchorElementId: null,
        hoveredAnchorPointIndex: null,
      }).some((handle) => handle.isSelected),
    ).toBe(false);
  });

  it("hides passive anchors when the rectangle disables unselected anchor display", () => {
    const rectangle = newElement({
      type: "rectangle",
      x: 100,
      y: 100,
      width: 100,
      height: 100,
      customData: {
        showAnchorsWhenUnselected: false,
      },
    }) as ExcalidrawBindableElement;

    expect(
      getAnchorPointHandleStatesForBindableElement(
        rectangle,
        arrayToMap([rectangle]),
        {
          isEditing: false,
          isSelected: false,
          pointerCoords: null,
          selectedAnchorPointIndex: null,
          zoomValue: 1,
          hoveredAnchorElementId: null,
          hoveredAnchorPointIndex: null,
        },
      ),
    ).toEqual([]);

    expect(
      getAnchorPointHandleStatesForBindableElement(
        rectangle,
        arrayToMap([rectangle]),
        {
          isEditing: false,
          isSelected: true,
          pointerCoords: null,
          selectedAnchorPointIndex: null,
          zoomValue: 1,
          hoveredAnchorElementId: null,
          hoveredAnchorPointIndex: null,
        },
      ),
    ).toHaveLength(4);
  });

  it("shows default image anchors as passive handles", () => {
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

    expect(
      getAnchorPointHandleStatesForBindableElement(image, arrayToMap([image]), {
        isEditing: false,
        isSelected: false,
        pointerCoords: pointFrom<GlobalPoint>(149, 100),
        selectedAnchorPointIndex: null,
        zoomValue: 1,
        hoveredAnchorElementId: image.id,
        hoveredAnchorPointIndex: 0,
      }),
    ).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          index: 0,
          fixedPoint: [0.5, 0],
          point: pointFrom(150, 100),
          isHovered: true,
        }),
        expect.objectContaining({ index: 1, fixedPoint: [1, 0.5] }),
        expect.objectContaining({ index: 2, fixedPoint: [0.5, 1] }),
        expect.objectContaining({ index: 3, fixedPoint: [0, 0.5] }),
      ]),
    );
  });
});
