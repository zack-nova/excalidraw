import { describe, expect, it } from "vitest";

import { API } from "@excalidraw/excalidraw/tests/helpers/api";
import { pointFrom } from "@excalidraw/math";

import { createProjectDocument } from "./engineering-domain";
import {
  buildEngineeringModelingProjection,
  validateEngineeringTopology,
} from "./engineering-modeling";

const createEngineeringImage = ({
  id,
  name,
  componentType,
  isEngineeringComponent = true,
  anchors = [
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
}: {
  id: string;
  name: string;
  componentType: string;
  isEngineeringComponent?: boolean;
  anchors?: Array<Record<string, unknown>>;
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
        component_type: componentType,
        anchors,
      },
    },
    anchorPoints: anchors.map((anchor) => {
      const position = anchor.position as { x: number; y: number };

      return [position.x, position.y];
    }),
  };

  return image;
};

const createEngineeringShape = ({
  id,
  type,
  isEngineeringComponent = true,
  groupIds = [],
  engineeringComponentGroupId,
}: {
  id: string;
  type: "rectangle" | "ellipse" | "diamond";
  isEngineeringComponent?: boolean;
  groupIds?: string[];
  engineeringComponentGroupId?: string;
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
    ...(engineeringComponentGroupId
      ? {
          engineeringComponentGroupId,
        }
      : {}),
  };

  return shape;
};

describe("engineering modeling projection", () => {
  it("derives component, anchor, pipe, structure tree, and scene bindings from engineering elements", () => {
    const project = createProjectDocument({
      id: "project:modeling",
      meta: {
        name: "Modeling project",
      },
    });
    const pump = createEngineeringImage({
      id: "component:pump",
      name: "给水泵",
      componentType: "Pump",
    });
    const boiler = createEngineeringImage({
      id: "component:boiler",
      name: "锅炉",
      componentType: "Boiler",
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
        elementId: pump.id,
        fixedPoint: [1, 0.5],
        mode: "orbit",
      },
      endBinding: {
        elementId: boiler.id,
        fixedPoint: [0, 0.5],
        mode: "orbit",
      },
    });

    const projection = buildEngineeringModelingProjection(project, [
      pump,
      boiler,
      pipe,
    ]);

    expect(Object.keys(projection.topology.componentsById)).toHaveLength(2);
    expect(Object.keys(projection.topology.anchorsById)).toHaveLength(4);
    expect(Object.keys(projection.topology.pipesById)).toHaveLength(1);
    expect(projection.scene.elementBindings[pump.id]).toEqual({
      elementId: pump.id,
      target: { kind: "component", id: `component:${pump.id}` },
    });
    expect(projection.scene.elementBindings[pipe.id]).toEqual({
      elementId: pipe.id,
      target: { kind: "pipe", id: `pipe:${pipe.id}` },
    });
    expect(projection.structureTree.components).toEqual([
      expect.objectContaining({
        entityId: `component:${pump.id}`,
        label: "给水泵",
      }),
      expect.objectContaining({
        entityId: `component:${boiler.id}`,
        label: "锅炉",
      }),
    ]);
    expect(projection.structureTree.pipes).toEqual([
      expect.objectContaining({
        entityId: `pipe:${pipe.id}`,
      }),
    ]);
  });

  it("excludes dynamic pipe binding anchors from structure tree anchor counts and labels", () => {
    const project = createProjectDocument();
    const source = createEngineeringImage({
      id: "component:source",
      name: "源",
      componentType: "Source",
    });
    const sink = createEngineeringImage({
      id: "component:sink",
      name: "汇",
      componentType: "Sink",
    });
    const pipe = API.createElement({
      id: "arrow:pipe-dynamic-1",
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
        fixedPoint: [1.0975, 0.4992],
        mode: "orbit",
      },
      endBinding: {
        elementId: sink.id,
        fixedPoint: [0, 0.5],
        mode: "orbit",
      },
    });

    const projection = buildEngineeringModelingProjection(project, [
      source,
      sink,
      pipe,
    ]);

    const sourceComponentId = `component:${source.id}`;
    const sourceComponent = projection.topology.componentsById[sourceComponentId];
    expect(sourceComponent).toBeDefined();

    const hasDynamicAnchor = sourceComponent!.anchorIds.some((anchorId) =>
      projection.topology.anchorsById[anchorId]?.key.startsWith("dynamic:"),
    );
    expect(hasDynamicAnchor).toBe(true);

    const sourceStructureNode = projection.structureTree.components.find(
      (component) => component.entityId === sourceComponentId,
    );
    expect(sourceStructureNode).toBeDefined();
    expect(sourceStructureNode?.detail).toBe("2 anchors");
    expect(
      sourceStructureNode?.childLabels?.some((label) =>
        label.startsWith("dynamic:"),
      ),
    ).toBe(false);
  });

  it("rejects arrows that are not connected to engineering component anchors", () => {
    const project = createProjectDocument();
    const pump = createEngineeringImage({
      id: "component:pump",
      name: "给水泵",
      componentType: "Pump",
    });
    const decoration = createEngineeringImage({
      id: "component:decoration",
      name: "装饰图片",
      componentType: "Decoration",
      isEngineeringComponent: false,
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
        elementId: pump.id,
        fixedPoint: [1, 0.5],
        mode: "orbit",
      },
      endBinding: {
        elementId: decoration.id,
        fixedPoint: [0, 0.5],
        mode: "orbit",
      },
    });

    const projection = buildEngineeringModelingProjection(project, [
      pump,
      decoration,
      pipe,
    ]);

    expect(Object.keys(projection.topology.componentsById)).toHaveLength(1);
    expect(projection.topology.pipesById).toEqual({});
    expect(projection.scene.elementBindings[pipe.id]).toBeUndefined();
  });

  it("treats bound rectangle, ellipse, and diamond elements as engineering components", () => {
    const project = createProjectDocument();
    const source = createEngineeringShape({
      id: "shape:source",
      type: "rectangle",
    });
    const sink = createEngineeringShape({
      id: "shape:sink",
      type: "ellipse",
    });
    const pipe = API.createElement({
      id: "arrow:shape-pipe-1",
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

    const projection = buildEngineeringModelingProjection(project, [
      source,
      sink,
      pipe,
      createEngineeringShape({
        id: "shape:diamond",
        type: "diamond",
      }),
    ]);

    expect(Object.keys(projection.topology.componentsById)).toHaveLength(3);
    expect(Object.keys(projection.topology.pipesById)).toHaveLength(1);
    expect(Object.keys(projection.topology.anchorsById)).toHaveLength(2);
    expect(projection.scene.elementBindings[source.id]).toEqual({
      elementId: source.id,
      target: { kind: "component", id: `component:${source.id}` },
    });
    expect(projection.scene.elementBindings[sink.id]).toEqual({
      elementId: sink.id,
      target: { kind: "component", id: `component:${sink.id}` },
    });
    expect(projection.structureTree.pipes).toEqual([
      expect.objectContaining({
        entityId: `pipe:${pipe.id}`,
        elementIds: [pipe.id],
      }),
    ]);
  });

  it("collapses grouped engineering elements into a single component entity", () => {
    const project = createProjectDocument();
    const groupId = "engineering-group:1";
    const groupA = createEngineeringShape({
      id: "shape:group-a",
      type: "rectangle",
      groupIds: [groupId],
      engineeringComponentGroupId: groupId,
    });
    const groupB = createEngineeringShape({
      id: "shape:group-b",
      type: "diamond",
      groupIds: [groupId],
      engineeringComponentGroupId: groupId,
    });
    const sink = createEngineeringShape({
      id: "shape:sink",
      type: "ellipse",
    });
    const pipe = API.createElement({
      id: "arrow:group-pipe-1",
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
        elementId: groupB.id,
        fixedPoint: [1, 0.5],
        mode: "orbit",
      },
      endBinding: {
        elementId: sink.id,
        fixedPoint: [0, 0.5],
        mode: "orbit",
      },
    });

    const projection = buildEngineeringModelingProjection(project, [
      groupA,
      groupB,
      sink,
      pipe,
    ]);

    expect(Object.keys(projection.topology.componentsById)).toHaveLength(2);
    expect(projection.scene.elementBindings[groupA.id]).toEqual({
      elementId: groupA.id,
      target: { kind: "component", id: `component:group:${groupId}` },
    });
    expect(projection.scene.elementBindings[groupB.id]).toEqual({
      elementId: groupB.id,
      target: { kind: "component", id: `component:group:${groupId}` },
    });
    expect(
      projection.topology.componentsById[`component:group:${groupId}`],
    ).toEqual(
      expect.objectContaining({
        props: expect.objectContaining({
          elementIds: [groupA.id, groupB.id],
          groupId,
        }),
      }),
    );
    expect(projection.structureTree.components).toContainEqual(
      expect.objectContaining({
        entityId: `component:group:${groupId}`,
        elementIds: [groupA.id, groupB.id],
      }),
    );
  });

  it("rebuilds topology CRUD output when scene elements are removed", () => {
    const project = createProjectDocument();
    const source = createEngineeringImage({
      id: "component:source",
      name: "源",
      componentType: "Source",
    });
    const sink = createEngineeringImage({
      id: "component:sink",
      name: "汇",
      componentType: "Sink",
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

    const initialProjection = buildEngineeringModelingProjection(project, [
      source,
      sink,
      pipe,
    ]);
    const nextProjection = buildEngineeringModelingProjection(project, [source]);

    expect(Object.keys(initialProjection.topology.componentsById)).toHaveLength(
      2,
    );
    expect(Object.keys(initialProjection.topology.pipesById)).toHaveLength(1);
    expect(Object.keys(nextProjection.topology.componentsById)).toHaveLength(1);
    expect(nextProjection.topology.pipesById).toEqual({});
  });

  it("keeps topology validation architecture empty until rules are added", () => {
    const project = createProjectDocument();
    const source = createEngineeringImage({
      id: "component:source",
      name: "源",
      componentType: "Source",
    });
    const projection = buildEngineeringModelingProjection(project, [source]);

    expect(validateEngineeringTopology(projection)).toEqual([]);
    expect(projection.diagnostics).toEqual([]);
  });
});
