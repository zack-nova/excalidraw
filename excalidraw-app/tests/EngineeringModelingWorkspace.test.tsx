import {
  fireEvent,
  render,
  screen,
  waitFor,
  withExcalidrawDimensions,
} from "@excalidraw/excalidraw/tests/test-utils";
import { CaptureUpdateAction } from "@excalidraw/excalidraw";
import { API } from "@excalidraw/excalidraw/tests/helpers/api";
import {
  createRedoAction,
  createUndoAction,
} from "@excalidraw/excalidraw/actions/actionHistory";
import { pointFrom } from "@excalidraw/math";
import { vi } from "vitest";

import ExcalidrawApp from "../App";
import { appJotaiStore } from "../app-jotai";
import { createProjectDocument } from "../engineering/engineering-domain";
import { engineeringProjectDocumentAtom } from "../engineering/engineering-domain-state";
import { engineeringWorkspaceModeAtom } from "../engineering/engineering-ui-state";

const createEngineeringImage = ({
  id,
  name,
  isEngineeringComponent,
}: {
  id: string;
  name: string;
  isEngineeringComponent: boolean;
}) => {
  const image = API.createElement({
    id,
    type: "image",
    width: 120,
    height: 80,
  });

  (
    image as typeof image & {
      customData: Record<string, unknown>;
    }
  ).customData = {
    component: {
      id,
      uuid: `${id}:uuid`,
      type: "component",
      isEngineeringComponent,
      position: { x: image.x, y: image.y },
      measured: { width: image.width, height: image.height },
      data: {
        name,
        name_cn: name,
        component_type: "Pump",
        anchors: [
          {
            id: "anchor-in",
            uuid: "anchor-in",
            node_id: "node-in",
            position: { x: 0, y: 0.5 },
            data: {
              name: "Inlet",
              name_cn: "入口",
              interface_type: "Inlet",
              connection_type: "inlet",
              is_connected: false,
              is_visible: true,
              allow_not_display: false,
              material_type: "water",
              tpis_extra_info: null,
            },
          },
          {
            id: "anchor-out",
            uuid: "anchor-out",
            node_id: "node-out",
            position: { x: 1, y: 0.5 },
            data: {
              name: "Outlet",
              name_cn: "出口",
              interface_type: "Outlet",
              connection_type: "outlet",
              is_connected: false,
              is_visible: true,
              allow_not_display: false,
              material_type: "steam",
              tpis_extra_info: null,
            },
          },
        ],
      },
    },
    anchorPoints: [
      [0, 0.5],
      [1, 0.5],
    ],
  };

  return image;
};

const createEngineeringShape = ({
  id,
  type,
  isEngineeringComponent,
  groupIds = [],
}: {
  id: string;
  type: "rectangle" | "ellipse" | "diamond";
  isEngineeringComponent: boolean;
  groupIds?: string[];
}) => {
  const shape = API.createElement({
    id,
    type,
    width: 120,
    height: 80,
    groupIds,
  });

  (
    shape as typeof shape & {
      customData: Record<string, unknown>;
    }
  ).customData = {
    isEngineeringComponent,
  };

  return shape;
};

describe("Engineering modeling workspace", () => {
  it("shows modeling properties without tabs and toggles rectangle engineering component state with undo and redo", async () => {
    appJotaiStore.set(engineeringWorkspaceModeAtom, "modeling");
    appJotaiStore.set(engineeringProjectDocumentAtom, createProjectDocument());

    await render(<ExcalidrawApp />);

    await withExcalidrawDimensions({ width: 1920, height: 1080 }, async () => {
      const source = createEngineeringShape({
        id: "shape:source",
        type: "rectangle",
        isEngineeringComponent: false,
      });
      const sink = createEngineeringShape({
        id: "shape:sink",
        type: "ellipse",
        isEngineeringComponent: true,
      });
      const pipe = API.createElement({
        id: "arrow:pipe-1",
        type: "arrow",
        x: 0,
        y: 0,
        width: 300,
        height: 0,
        points: [
          pointFrom(0, 0),
          pointFrom(300, 0),
        ],
        startBinding: {
          elementId: source.id,
          fixedPoint: [1, 0.5],
          mode: "orbit",
        },
        endBinding: {
          elementId: sink.id,
          fixedPoint: [0, 0.5],
          mode: "orbit",
        },
      });

      API.updateScene({
        elements: [source, sink, pipe],
        captureUpdate: CaptureUpdateAction.NEVER,
      });
      API.setSelectedElements([source]);
      window.h.history.clear();

      await waitFor(() => {
        expect(screen.queryByRole("tablist")).toBeNull();
      });

      expect(screen.queryByTestId("engineering-structure-tree")).toBeNull();
      expect(
        screen.getByTestId("engineering-component-toggle"),
      ).toBeVisible();
      expect(API.getUndoStack()).toHaveLength(0);

      fireEvent.click(screen.getByTestId("engineering-component-toggle"));

      await waitFor(() => {
        expect(
          (
            API.getElement(source) as typeof source & {
              customData?: Record<string, unknown>;
            }
          ).customData?.isEngineeringComponent,
        ).toBe(true);
      });
      expect(API.getUndoStack()).toHaveLength(1);

      API.executeAction(createUndoAction(window.h.history));

      await waitFor(() => {
        expect(API.getRedoStack()).toHaveLength(1);
      });

      API.executeAction(createRedoAction(window.h.history));

      await waitFor(() => {
        expect(API.getUndoStack()).toHaveLength(1);
      });
    });
  });

  it("renders the engineering structure tab between the library and comments tabs and links tree selection back to the canvas", async () => {
    appJotaiStore.set(engineeringWorkspaceModeAtom, "modeling");
    appJotaiStore.set(engineeringProjectDocumentAtom, createProjectDocument());

    await render(<ExcalidrawApp />);

    await withExcalidrawDimensions({ width: 1920, height: 1080 }, async () => {
      const source = createEngineeringImage({
        id: "component:source",
        name: "给水泵",
        isEngineeringComponent: true,
      });
      const sink = createEngineeringImage({
        id: "component:sink",
        name: "锅炉",
        isEngineeringComponent: true,
      });
      const pipe = API.createElement({
        id: "arrow:pipe-1",
        type: "arrow",
        x: 0,
        y: 0,
        width: 300,
        height: 0,
        points: [
          pointFrom(0, 0),
          pointFrom(300, 0),
        ],
        startBinding: {
          elementId: source.id,
          fixedPoint: [1, 0.5],
          mode: "orbit",
        },
        endBinding: {
          elementId: sink.id,
          fixedPoint: [0, 0.5],
          mode: "orbit",
        },
      });

      API.updateScene({
        elements: [source, sink, pipe],
        captureUpdate: CaptureUpdateAction.NEVER,
      });
      API.setAppState({
        openSidebar: {
          name: "default",
          tab: "engineering-structure",
        },
      });

      await waitFor(() => {
        expect(
          screen.getByTestId("engineering-structure-tree"),
        ).toBeVisible();
      });

      const structureTrigger = screen.getByTestId(
        "engineering-structure-sidebar-trigger",
      );
      const commentsTrigger = screen.getByTestId("comments-sidebar-trigger");

      expect(
        structureTrigger.compareDocumentPosition(commentsTrigger) &
          Node.DOCUMENT_POSITION_FOLLOWING,
      ).not.toBe(0);

      const scrollSpy = vi.spyOn(window.h.app, "scrollToContent");

      fireEvent.click(
        screen.getByTestId(`engineering-structure-node-component:${source.id}`),
      );

      await waitFor(() => {
        expect(API.getSelectedElements().map((element) => element.id)).toEqual([
          source.id,
        ]);
      });
      expect(scrollSpy).toHaveBeenCalled();

      fireEvent.click(
        screen.getByTestId(`engineering-structure-node-pipe:${pipe.id}`),
      );

      await waitFor(() => {
        expect(API.getSelectedElements().map((element) => element.id)).toEqual([
          pipe.id,
        ]);
      });
    });
  });

  it("reflects canvas selection back into the structure tree and supports grouped custom components", async () => {
    appJotaiStore.set(engineeringWorkspaceModeAtom, "modeling");
    appJotaiStore.set(engineeringProjectDocumentAtom, createProjectDocument());

    await render(<ExcalidrawApp />);

    await withExcalidrawDimensions({ width: 1920, height: 1080 }, async () => {
      const groupId = "engineering-group:1";
      const groupedA = createEngineeringShape({
        id: "shape:group-a",
        type: "rectangle",
        isEngineeringComponent: false,
        groupIds: [groupId],
      });
      const groupedB = createEngineeringShape({
        id: "shape:group-b",
        type: "diamond",
        isEngineeringComponent: false,
        groupIds: [groupId],
      });
      const sink = createEngineeringShape({
        id: "shape:sink",
        type: "ellipse",
        isEngineeringComponent: true,
      });
      const pipe = API.createElement({
        id: "arrow:pipe-1",
        type: "arrow",
        x: 0,
        y: 0,
        width: 300,
        height: 0,
        points: [
          pointFrom(0, 0),
          pointFrom(300, 0),
        ],
        startBinding: {
          elementId: groupedB.id,
          fixedPoint: [1, 0.5],
          mode: "orbit",
        },
        endBinding: {
          elementId: sink.id,
          fixedPoint: [0, 0.5],
          mode: "orbit",
        },
      });

      API.updateScene({
        elements: [groupedA, groupedB, sink, pipe],
        captureUpdate: CaptureUpdateAction.NEVER,
      });
      API.setSelectedElements([groupedA, groupedB]);

      fireEvent.click(screen.getByTestId("engineering-component-toggle"));

      await waitFor(() => {
        const nextA = API.getElement(groupedA) as typeof groupedA & {
          customData?: Record<string, unknown>;
        };
        const nextB = API.getElement(groupedB) as typeof groupedB & {
          customData?: Record<string, unknown>;
        };

        expect(nextA.customData?.engineeringComponentGroupId).toBe(groupId);
        expect(nextB.customData?.engineeringComponentGroupId).toBe(groupId);
      });

      API.setAppState({
        openSidebar: {
          name: "default",
          tab: "engineering-structure",
        },
      });

      await waitFor(() => {
        expect(screen.getByTestId("engineering-structure-components")).toHaveTextContent(
          "2",
        );
      });

      API.setSelectedElements([sink]);

      await waitFor(() => {
        expect(
          screen.getByTestId(`engineering-structure-node-component:${sink.id}`),
        ).toHaveAttribute("data-selected", "true");
      });
    });
  });

  it("renders data workspace tabs and replaces the last properties tab with a placeholder tab", async () => {
    appJotaiStore.set(engineeringWorkspaceModeAtom, "data");
    appJotaiStore.set(engineeringProjectDocumentAtom, createProjectDocument());

    await render(<ExcalidrawApp />);

    await withExcalidrawDimensions({ width: 1920, height: 1080 }, async () => {
      const component = createEngineeringImage({
        id: "component:source",
        name: "给水泵",
        isEngineeringComponent: true,
      });

      API.updateScene({
        elements: [component],
        captureUpdate: CaptureUpdateAction.NEVER,
      });
      API.setSelectedElements([component]);

      await waitFor(() => {
        expect(
          screen.getByRole("tablist", { name: "Properties sections" }),
        ).toBeVisible();
      });

      const tabs = Array.from(
        screen
          .getByRole("tablist", { name: "Properties sections" })
          .querySelectorAll<HTMLElement>("[role='tab']"),
      );

      expect(tabs).toHaveLength(5);
      expect(tabs.at(-1)).not.toHaveTextContent("Properties");

      fireEvent.click(screen.getByRole("tab", { name: /^Actions$/i }));

      await waitFor(() => {
        expect(
          screen.getByTestId("selected-shape-actions-placeholder-panel"),
        ).toBeVisible();
      });
    });
  });
});
