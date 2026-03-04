import { createStore } from "jotai";
import { describe, expect, it } from "vitest";

import { API } from "@excalidraw/excalidraw/tests/helpers/api";
import { pointFrom } from "@excalidraw/math";

import { createProjectDocument } from "./engineering-domain";
import {
  engineeringModelingProjectionAtom,
  engineeringStructureTreeAtom,
  syncEngineeringSceneToModelAtom,
} from "./engineering-modeling-state";
import { engineeringProjectDocumentAtom } from "./engineering-domain-state";

const createEngineeringImage = ({
  id,
  isEngineeringComponent = true,
}: {
  id: string;
  isEngineeringComponent?: boolean;
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
        name: id,
        name_cn: id,
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

describe("engineering modeling state", () => {
  it("bumps the project model version only when topology changes", () => {
    const store = createStore();
    const project = createProjectDocument({
      id: "project:modeling-store",
    });
    const source = createEngineeringImage({
      id: "component:source",
    });

    store.set(engineeringProjectDocumentAtom, project);

    const initialModelVersion = store.get(engineeringProjectDocumentAtom)
      .revisions.modelVersion;

    store.set(syncEngineeringSceneToModelAtom, [source]);

    expect(store.get(engineeringProjectDocumentAtom).revisions.modelVersion).toBe(
      initialModelVersion + 1,
    );
    expect(
      store.get(engineeringModelingProjectionAtom).topology.componentsById,
    ).toEqual({
      [`component:${source.id}`]: expect.objectContaining({
        id: `component:${source.id}`,
      }),
    });

    const afterFirstSyncVersion = store.get(engineeringProjectDocumentAtom)
      .revisions.modelVersion;

    store.set(syncEngineeringSceneToModelAtom, [source]);

    expect(store.get(engineeringProjectDocumentAtom).revisions.modelVersion).toBe(
      afterFirstSyncVersion,
    );
  });

  it("updates the structure tree when arrows become valid engineering pipes", () => {
    const store = createStore();
    const project = createProjectDocument();
    const source = createEngineeringImage({
      id: "component:source",
    });
    const sink = createEngineeringImage({
      id: "component:sink",
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

    store.set(engineeringProjectDocumentAtom, project);
    store.set(syncEngineeringSceneToModelAtom, [source, sink, pipe]);

    expect(store.get(engineeringStructureTreeAtom).components).toHaveLength(2);
    expect(store.get(engineeringStructureTreeAtom).pipes).toEqual([
      expect.objectContaining({
        entityId: `pipe:${pipe.id}`,
      }),
    ]);
  });
});
