import { Excalidraw } from "@excalidraw/excalidraw";
import { API } from "@excalidraw/excalidraw/tests/helpers/api";
import { Keyboard, Pointer, UI } from "@excalidraw/excalidraw/tests/helpers/ui";
import {
  act,
  fireEvent,
  render,
  screen,
} from "@excalidraw/excalidraw/tests/test-utils";
import { defaultLang, setLanguage } from "@excalidraw/excalidraw/i18n";
import { KEYS } from "@excalidraw/common";
import { actionGroup } from "@excalidraw/excalidraw/actions";

import type { ExcalidrawLinearElement } from "../src/types";

const { h } = window;
const mouse = new Pointer("mouse");

describe("rectangle anchor editor", () => {
  beforeEach(async () => {
    mouse.reset();

    await act(() => {
      return setLanguage(defaultLang);
    });
    await render(<Excalidraw handleKeyboardGlobally={true} />);
  });

  const enableAnchorEditor = () => {
    const toggle = screen.getByLabelText("Edit anchor points");
    fireEvent.click(toggle);
    return toggle;
  };

  const getShowWhenUnselectedToggle = () =>
    screen.getByLabelText("Show anchors when unselected");

  it("should toggle anchor editing from the right sidebar", () => {
    const rectangle = API.createElement({
      type: "rectangle",
      x: 100,
      y: 100,
      width: 100,
      height: 100,
    });

    API.setElements([rectangle]);
    API.setSelectedElements([rectangle]);

    const toggle = enableAnchorEditor();

    expect(toggle).toBeChecked();
    expect(h.state.editingAnchorElementId).toBe(rectangle.id);
    expect(h.state.selectedAnchorPointIndex).toBe(null);
  });

  it("should show anchor controls for ellipse, diamond, and image", () => {
    const ellipse = API.createElement({
      type: "ellipse",
      x: 100,
      y: 100,
      width: 100,
      height: 100,
    });
    const diamond = API.createElement({
      type: "diamond",
      x: 100,
      y: 100,
      width: 100,
      height: 100,
    });
    const image = API.createElement({
      type: "image",
      x: 100,
      y: 100,
      width: 100,
      height: 100,
    });

    API.setElements([ellipse]);
    API.setSelectedElements([ellipse]);
    expect(screen.getByLabelText("Edit anchor points")).not.toBeChecked();
    expect(screen.getByLabelText("Show anchors when unselected")).toBeChecked();

    API.setElements([diamond]);
    API.setSelectedElements([diamond]);
    expect(screen.getByLabelText("Edit anchor points")).not.toBeChecked();
    expect(screen.getByLabelText("Show anchors when unselected")).toBeChecked();

    API.setElements([image]);
    API.setSelectedElements([image]);
    expect(screen.getByLabelText("Edit anchor points")).not.toBeChecked();
    expect(screen.getByLabelText("Show anchors when unselected")).toBeChecked();
  });

  it("should toggle whether anchors stay visible when the rectangle is unselected", () => {
    const rectangle = API.createElement({
      type: "rectangle",
      x: 100,
      y: 100,
      width: 100,
      height: 100,
    });

    API.setElements([rectangle]);
    API.setSelectedElements([rectangle]);

    const toggle = getShowWhenUnselectedToggle();
    fireEvent.click(toggle);

    expect(
      API.getElement(rectangle).customData?.showAnchorsWhenUnselected,
    ).toBe(false);

    fireEvent.click(getShowWhenUnselectedToggle());

    expect(
      API.getElement(rectangle).customData?.showAnchorsWhenUnselected,
    ).toBe(undefined);
  });

  it("should toggle unselected anchor visibility for all eligible elements in a selected group", () => {
    const rectangle = API.createElement({
      type: "rectangle",
      x: 100,
      y: 100,
      width: 100,
      height: 100,
    });
    const ellipse = API.createElement({
      type: "ellipse",
      x: 260,
      y: 100,
      width: 100,
      height: 100,
    });

    API.setElements([rectangle, ellipse]);
    API.setSelectedElements([rectangle, ellipse]);
    API.executeAction(actionGroup);

    expect(screen.queryByLabelText("Edit anchor points")).toBe(null);

    const toggle = getShowWhenUnselectedToggle();
    fireEvent.click(toggle);

    expect(
      API.getElement(rectangle).customData?.showAnchorsWhenUnselected,
    ).toBe(false);
    expect(API.getElement(ellipse).customData?.showAnchorsWhenUnselected).toBe(
      false,
    );

    fireEvent.click(getShowWhenUnselectedToggle());

    expect(
      API.getElement(rectangle).customData?.showAnchorsWhenUnselected,
    ).toBe(undefined);
    expect(API.getElement(ellipse).customData?.showAnchorsWhenUnselected).toBe(
      undefined,
    );
  });

  it("should add a new anchor when clicking on the rectangle edge in edit mode", () => {
    const rectangle = API.createElement({
      type: "rectangle",
      x: 100,
      y: 100,
      width: 100,
      height: 100,
    });

    API.setElements([rectangle]);
    API.setSelectedElements([rectangle]);
    enableAnchorEditor();

    mouse.clickAt(125, 100);

    expect(API.getElement(rectangle).customData?.anchorPoints).toEqual([
      [0.5, 0],
      [1, 0.5],
      [0.5, 1],
      [0, 0.5],
      [0.25, 0],
    ]);
  });

  it("should add a new anchor when clicking on a circle edge in edit mode", () => {
    const ellipse = API.createElement({
      type: "ellipse",
      x: 100,
      y: 100,
      width: 100,
      height: 100,
    });

    API.setElements([ellipse]);
    API.setSelectedElements([ellipse]);
    enableAnchorEditor();

    mouse.clickAt(185.35533905932738, 114.64466094067262);

    const anchorPoints = API.getElement(ellipse).customData?.anchorPoints;

    expect(anchorPoints).toHaveLength(5);
    expect(anchorPoints?.[4][0]).toBeCloseTo(0.85355, 2);
    expect(anchorPoints?.[4][1]).toBeCloseTo(0.14645, 2);
  });

  it("should drag an existing anchor to a new position", () => {
    const rectangle = API.createElement({
      type: "rectangle",
      x: 100,
      y: 100,
      width: 100,
      height: 100,
    });

    API.setElements([rectangle]);
    API.setSelectedElements([rectangle]);
    enableAnchorEditor();

    mouse.downAt(150, 100);
    mouse.moveTo(125, 100);
    mouse.up();

    expect(API.getElement(rectangle).customData?.anchorPoints).toEqual([
      [0.25, 0],
      [1, 0.5],
      [0.5, 1],
      [0, 0.5],
    ]);
  });

  it("should delete the selected anchor with the delete key", () => {
    const rectangle = API.createElement({
      type: "rectangle",
      x: 100,
      y: 100,
      width: 100,
      height: 100,
    });

    API.setElements([rectangle]);
    API.setSelectedElements([rectangle]);
    enableAnchorEditor();

    mouse.clickAt(150, 100);
    Keyboard.keyPress(KEYS.DELETE);

    expect(API.getElement(rectangle).customData?.anchorPoints).toEqual([
      [1, 0.5],
      [0.5, 1],
      [0, 0.5],
    ]);
  });

  it("should delete the selected default anchor from an ellipse", () => {
    const ellipse = API.createElement({
      type: "ellipse",
      x: 100,
      y: 100,
      width: 100,
      height: 100,
    });

    API.setElements([ellipse]);
    API.setSelectedElements([ellipse]);
    enableAnchorEditor();

    mouse.clickAt(150, 100);
    Keyboard.keyPress(KEYS.DELETE);

    expect(API.getElement(ellipse).customData?.anchorPoints).toEqual([
      [1, 0.5],
      [0.5, 1],
      [0, 0.5],
    ]);
  });

  it("should update bound arrows when an edited anchor moves", () => {
    const rectangle = API.createElement({
      type: "rectangle",
      x: 100,
      y: 100,
      width: 100,
      height: 100,
    });

    API.setElements([rectangle]);
    API.updateElement(rectangle, {
      customData: {
        anchorPoints: [[0.5, 0]],
      },
    });

    UI.clickTool("arrow");
    mouse.downAt(0, 150);
    mouse.moveTo(150, 96);
    mouse.up();

    const arrow = API.getSelectedElement() as ExcalidrawLinearElement;

    API.setSelectedElements([rectangle]);
    enableAnchorEditor();

    mouse.downAt(150, 100);
    mouse.moveTo(125, 100);
    mouse.up();

    expect(arrow.endBinding?.fixedPoint[0]).toBeCloseTo(0.25, 2);
    expect(arrow.endBinding?.fixedPoint[1]).toBeCloseTo(0, 2);
  });

  it("should hover a custom anchor without enabling anchor editing", () => {
    const rectangle = API.createElement({
      type: "rectangle",
      x: 100,
      y: 100,
      width: 100,
      height: 100,
    });

    API.setElements([rectangle]);
    API.updateElement(rectangle, {
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
    API.setSelectedElements([rectangle]);

    mouse.moveTo(125, 100);

    expect(h.state.hoveredAnchorPointIndex).toBe(4);

    mouse.moveTo(300, 300);

    expect(h.state.hoveredAnchorPointIndex).toBe(null);
  });

  it("should hover a default anchor even when the rectangle is not selected", () => {
    const rectangle = API.createElement({
      type: "rectangle",
      x: 100,
      y: 100,
      width: 100,
      height: 100,
    });

    API.setElements([rectangle]);
    API.clearSelection();

    mouse.moveTo(150, 100);

    expect(h.state.hoveredAnchorElementId).toBe(rectangle.id);
    expect(h.state.hoveredAnchorPointIndex).toBe(0);

    mouse.moveTo(300, 300);

    expect(h.state.hoveredAnchorElementId).toBe(null);
    expect(h.state.hoveredAnchorPointIndex).toBe(null);
  });

  it("should hover a default diamond anchor even when the diamond is not selected", () => {
    const diamond = API.createElement({
      type: "diamond",
      x: 100,
      y: 100,
      width: 100,
      height: 100,
    });

    API.setElements([diamond]);
    API.clearSelection();

    mouse.moveTo(150, 100);

    expect(h.state.hoveredAnchorElementId).toBe(diamond.id);
    expect(h.state.hoveredAnchorPointIndex).toBe(0);
  });

  it("should not hover an anchor when unselected anchor display is disabled", () => {
    const rectangle = API.createElement({
      type: "rectangle",
      x: 100,
      y: 100,
      width: 100,
      height: 100,
    });

    API.setElements([rectangle]);
    API.setSelectedElements([rectangle]);

    fireEvent.click(getShowWhenUnselectedToggle());
    API.clearSelection();

    mouse.moveTo(150, 100);

    expect(h.state.hoveredAnchorElementId).toBe(null);
    expect(h.state.hoveredAnchorPointIndex).toBe(null);
  });
});
