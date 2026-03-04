import { CaptureUpdateAction } from "@excalidraw/excalidraw";
import {
  computeContainerDimensionForBoundText,
  newElementWith,
} from "@excalidraw/element";
import type {
  ExcalidrawRectangleElement,
  ExcalidrawTextElement,
  ExcalidrawTextElementWithContainer,
} from "@excalidraw/element/types";
import { API } from "@excalidraw/excalidraw/tests/helpers/api";
import { Keyboard, Pointer } from "@excalidraw/excalidraw/tests/helpers/ui";
import { getTextEditor, updateTextEditor } from "@excalidraw/excalidraw/tests/queries/dom";
import {
  act,
  render,
  waitFor,
  cleanup,
} from "@excalidraw/excalidraw/tests/test-utils";
import { afterEach, describe, expect, it } from "vitest";

import ExcalidrawApp from "../App";
import {
  publishEngineeringData,
  resetEngineeringDataChannelForTests,
} from "../data/engineeringData";

const mouse = new Pointer("mouse");

describe("engineering data driven text updates", () => {
  afterEach(() => {
    resetEngineeringDataChannelForTests();
    cleanup();
  });

  it("updates text elements when simulated backend data arrives without polluting history", async () => {
    await render(<ExcalidrawApp />);

    const pressureUuid = "550e8400-e29b-41d4-a716-446655440000";
    const textElement = newElementWith(
      API.createElement({
        type: "text",
        text: `Pressure={{pressure}} kPa, Raw={{data[${pressureUuid}].value}}, Power={{data[${pressureUuid}].value * current}}`,
      }),
      {},
      true,
    );

    API.updateScene({
      elements: [textElement],
      captureUpdate: CaptureUpdateAction.IMMEDIATELY,
    });

    await waitFor(() => {
      expect(window.h.elements[0]).toEqual(
        expect.objectContaining({
          originalText: `Pressure={{pressure}} kPa, Raw={{data[${pressureUuid}].value}}, Power={{data[${pressureUuid}].value * current}}`,
        }),
      );
    });

    const undoStackLengthBeforePush = API.getUndoStack().length;

    act(() => {
      publishEngineeringData([
        {
          uuid: pressureUuid,
          alias: "pressure",
          name: "pressure",
          value: 12,
          unit: "kPa",
        },
        {
          uuid: "660e8400-e29b-41d4-a716-446655440000",
          alias: "current",
          name: "current",
          value: 3,
          unit: "A",
        },
      ]);
    });

    await waitFor(() => {
      expect(window.h.elements[0]).toEqual(
        expect.objectContaining({
          originalText:
            `Pressure={{pressure}} kPa, Raw={{data[${pressureUuid}].value}}, Power={{data[${pressureUuid}].value * current}}`,
          text: "Pressure=12 kPa, Raw=12, Power=36",
          customData: expect.objectContaining({
            engineeringTemplate:
              `Pressure={{pressure}} kPa, Raw={{data[${pressureUuid}].value}}, Power={{data[${pressureUuid}].value * current}}`,
          }),
        }),
      );
      expect(API.getUndoStack().length).toBe(undoStackLengthBeforePush);
    });

    act(() => {
      publishEngineeringData([
        {
          uuid: pressureUuid,
          alias: "pressure",
          name: "pressure",
          value: 15,
          unit: "kPa",
        },
        {
          uuid: "660e8400-e29b-41d4-a716-446655440000",
          alias: "current",
          name: "current",
          value: 4,
          unit: "A",
        },
      ]);
    });

    await waitFor(() => {
      expect(window.h.elements[0]).toEqual(
        expect.objectContaining({
          originalText:
            `Pressure={{pressure}} kPa, Raw={{data[${pressureUuid}].value}}, Power={{data[${pressureUuid}].value * current}}`,
          text: "Pressure=15 kPa, Raw=15, Power=60",
        }),
      );
      expect(API.getUndoStack().length).toBe(undoStackLengthBeforePush);
    });
  });

  it("reopens rendered engineering text in formula mode and reapplies rendering after submit", async () => {
    await render(<ExcalidrawApp />);

    const pressureUuid = "550e8400-e29b-41d4-a716-446655440000";
    const template =
      `Pressure={{pressure}} kPa, Raw={{data[${pressureUuid}].value}}, Power={{data[${pressureUuid}].value * current}}`;
    const textElement = newElementWith(
      API.createElement({
        type: "text",
        text: template,
      }),
      {},
      true,
    );

    API.updateScene({
      elements: [textElement],
      captureUpdate: CaptureUpdateAction.IMMEDIATELY,
    });

    const templateWidth = (window.h.elements[0] as ExcalidrawTextElement).width;

    act(() => {
      publishEngineeringData([
        {
          uuid: pressureUuid,
          alias: "pressure",
          name: "pressure",
          value: 12,
          unit: "kPa",
        },
        {
          uuid: "660e8400-e29b-41d4-a716-446655440000",
          alias: "current",
          name: "current",
          value: 3,
          unit: "A",
        },
      ]);
    });

    await waitFor(() => {
      expect(window.h.elements[0]).toEqual(
        expect.objectContaining({
          originalText: template,
          text: "Pressure=12 kPa, Raw=12, Power=36",
        }),
      );
    });

    const renderedWidth = (window.h.elements[0] as ExcalidrawTextElement).width;
    expect(renderedWidth).toBeLessThan(templateWidth);

    mouse.doubleClickOn(window.h.elements[0] as ExcalidrawTextElement);

    const editor = await getTextEditor({ waitForEditor: true });
    expect(editor.value).toBe(template);
    await waitFor(() => {
      expect((window.h.elements[0] as ExcalidrawTextElement).width).toBe(
        templateWidth,
      );
      expect((window.h.elements[0] as ExcalidrawTextElement).text).toBe(
        template,
      );
    });

    act(() => {
      publishEngineeringData([
        {
          uuid: pressureUuid,
          alias: "pressure",
          name: "pressure",
          value: 18,
          unit: "kPa",
        },
        {
          uuid: "660e8400-e29b-41d4-a716-446655440000",
          alias: "current",
          name: "current",
          value: 5,
          unit: "A",
        },
      ]);
    });

    expect(editor.value).toBe(template);
    expect((window.h.elements[0] as ExcalidrawTextElement).width).toBe(
      templateWidth,
    );
    expect((window.h.elements[0] as ExcalidrawTextElement).text).toBe(
      template,
    );

    updateTextEditor(editor, "Adjusted={{pressure + 1}}");
    act(() => {
      editor.blur();
    });

    await waitFor(() => {
      expect(window.h.elements[0]).toEqual(
        expect.objectContaining({
          originalText: "Adjusted={{pressure + 1}}",
          text: "Adjusted=19",
          customData: expect.objectContaining({
            engineeringTemplate: "Adjusted={{pressure + 1}}",
          }),
        }),
      );
    });
  });

  it("updates text elements for conditional aggregation helpers", async () => {
    await render(<ExcalidrawApp />);

    const textElement = newElementWith(
      API.createElement({
        type: "text",
        text:
          'Pump total={{sumWhere("value", "group", "pump")}}, Peak={{maxWhere("value", "group", "pump")}}, Avg A1={{round(avgWhere("value", "group", "pump", "tags.area", "A1"), 2)}}',
      }),
      {},
      true,
    );

    API.updateScene({
      elements: [textElement],
      captureUpdate: CaptureUpdateAction.IMMEDIATELY,
    });

    act(() => {
      publishEngineeringData([
        {
          uuid: "pump-pressure-1",
          alias: "pressure_1",
          group: "pump",
          measurement: "pressure",
          value: 10.1,
          tags: {
            area: "A1",
          },
        },
        {
          uuid: "pump-pressure-2",
          alias: "pressure_2",
          group: "pump",
          measurement: "pressure",
          value: 20.5,
          tags: {
            area: "A1",
          },
        },
        {
          uuid: "pump-pressure-3",
          alias: "pressure_3",
          group: "pump",
          measurement: "pressure",
          value: 31.2,
          tags: {
            area: "A2",
          },
        },
      ]);
    });

    await waitFor(() => {
      expect(window.h.elements[0]).toEqual(
        expect.objectContaining({
          text: "Pump total=61.8, Peak=31.2, Avg A1=15.3",
        }),
      );
    });

    act(() => {
      publishEngineeringData([
        {
          uuid: "pump-pressure-1",
          alias: "pressure_1",
          group: "pump",
          measurement: "pressure",
          value: 11.1,
          tags: {
            area: "A1",
          },
        },
        {
          uuid: "pump-pressure-2",
          alias: "pressure_2",
          group: "pump",
          measurement: "pressure",
          value: 25.5,
          tags: {
            area: "A1",
          },
        },
        {
          uuid: "pump-pressure-3",
          alias: "pressure_3",
          group: "pump",
          measurement: "pressure",
          value: 29.5,
          tags: {
            area: "A2",
          },
        },
      ]);
    });

    await waitFor(() => {
      expect(window.h.elements[0]).toEqual(
        expect.objectContaining({
          text: "Pump total=66.1, Peak=29.5, Avg A1=18.3",
        }),
      );
    });
  });

  it("keeps engineering formula editor outside the rectangle and shrinks the container back to rendered height", async () => {
    await render(<ExcalidrawApp />);

    const rectangle = API.createElement({
      type: "rectangle",
      width: 120,
      height: 200,
    });

    API.updateScene({
      elements: [rectangle],
      captureUpdate: CaptureUpdateAction.IMMEDIATELY,
    });
    API.setSelectedElements([window.h.elements[0]]);

    Keyboard.keyPress("Enter");

    const editor = await getTextEditor({ waitForEditor: true });
    const template =
      'Pump total={{sumWhere("value", "group", "pump", "measurement", "pressure", "tags.area", "A1")}} / Peak={{maxWhere("value", "group", "pump", "measurement", "pressure")}} / Avg={{round(avgWhere("value", "group", "pump", "tags.area", "A1"), 2)}}';

    updateTextEditor(editor, template);

    await waitFor(() => {
      const currentRectangle = window.h.elements[0] as ExcalidrawRectangleElement;
      expect(currentRectangle.height).toBe(200);
      expect(parseFloat(editor.style.width)).toBeGreaterThan(
        currentRectangle.width,
      );
    });

    act(() => {
      publishEngineeringData([
        {
          uuid: "pump-pressure-1",
          alias: "pressure_1",
          group: "pump",
          measurement: "pressure",
          value: 10.1,
          tags: {
            area: "A1",
          },
        },
        {
          uuid: "pump-pressure-2",
          alias: "pressure_2",
          group: "pump",
          measurement: "pressure",
          value: 20.5,
          tags: {
            area: "A1",
          },
        },
        {
          uuid: "pump-pressure-3",
          alias: "pressure_3",
          group: "pump",
          measurement: "pressure",
          value: 31.2,
          tags: {
            area: "A2",
          },
        },
      ]);
    });

    act(() => {
      editor.blur();
    });

    await waitFor(() => {
      const currentRectangle = window.h.elements[0] as ExcalidrawRectangleElement;
      const boundText = window.h.elements[1] as ExcalidrawTextElementWithContainer;

      expect(boundText.text).toContain("total=30.6");
      expect(boundText.text).toContain("Peak=31.2");
      expect(boundText.text).toContain("Avg=15.3");
      expect(currentRectangle.height).toBe(
        computeContainerDimensionForBoundText(
          boundText.height,
          currentRectangle.type,
        ),
      );
      expect(currentRectangle.height).toBeLessThan(200);
    });
  });
});
