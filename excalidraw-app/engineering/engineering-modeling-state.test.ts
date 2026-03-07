import { createStore } from "jotai";
import { describe, expect, it } from "vitest";

import { API } from "@excalidraw/excalidraw/tests/helpers/api";
import { pointFrom } from "@excalidraw/math";

import { createProjectDocument } from "./engineering-domain";
import { componentSpecCatalogAtom } from "../component-spec-store";
import {
  engineeringModelingProjectionAtom,
  engineeringStructureTreeAtom,
  syncEngineeringSceneToModelAtom,
} from "./engineering-modeling-state";
import { engineeringProjectDocumentAtom } from "./engineering-domain-state";

const createEngineeringImage = ({
  id,
  isEngineeringComponent = true,
  componentType = "Pump",
}: {
  id: string;
  isEngineeringComponent?: boolean;
  componentType?: string;
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
        component_type: componentType,
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

const createComponentSpecCatalogState = () => ({
  specsByType: {
    Boiler: {
      componentType: "Boiler",
      id: null,
      uuid: null,
      group: null,
      icon: null,
      measured: null,
      operationMode: null,
      data: null,
      inputParameters: [
        {
          id: "Eff",
          uuid: null,
          key: "Eff",
          name: "Eff",
          nameCn: "锅炉效率",
          source: "frontend_manual_input",
          valueType: "float",
          unit: "%",
          defaultValue: null,
          tips: null,
          enumOptions: null,
          physicalEntityType: "component",
          group: null,
          required: null,
          inputStatus: null,
          allowNotDisplay: null,
          tpisKey: "Eff",
          tpisOperationMode: null,
          tpisExtraInfo: null,
          hasCurveData: false,
        },
      ],
      outputParameters: [
        {
          id: "REff",
          uuid: null,
          key: "REff",
          name: "REff",
          nameCn: "锅炉效率结果",
          source: "backend_calculation",
          valueType: "float",
          unit: "%",
          defaultValue: null,
          tips: null,
          enumOptions: null,
          physicalEntityType: "component",
          group: null,
          required: null,
          inputStatus: null,
          allowNotDisplay: null,
          tpisKey: "REff",
          tpisOperationMode: null,
          tpisExtraInfo: null,
          hasCurveData: false,
        },
      ],
    },
  },
  loadStatusByType: {
    Boiler: "ready" as const,
  },
  errorsByType: {},
});

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

  it("bridges loaded component template specs into variable catalog and cleans managed variables on topology removal", () => {
    const store = createStore();
    const project = createProjectDocument();
    project.variableCatalog.variablesById["var:custom:ambient"] = {
      id: "var:custom:ambient",
      owner: { kind: "environment", id: "environment:default" },
      key: "ambient",
      name: "Ambient",
      valueType: "float",
      role: "input",
      stage: "raw",
    };
    project.variableCatalog.providersById["provider:custom:ambient:manual"] = {
      id: "provider:custom:ambient:manual",
      variableId: "var:custom:ambient",
      kind: "manual",
    };
    project.variableCatalog.providerIdsByVariableId["var:custom:ambient"] = [
      "provider:custom:ambient:manual",
    ];

    const boiler = createEngineeringImage({
      id: "component:boiler",
      componentType: "Boiler",
    });

    store.set(engineeringProjectDocumentAtom, project);
    store.set(componentSpecCatalogAtom, createComponentSpecCatalogState());
    store.set(syncEngineeringSceneToModelAtom, [boiler]);

    const withBridgeCatalog = store.get(engineeringProjectDocumentAtom).variableCatalog;
    const generatedInputVariable = Object.values(withBridgeCatalog.variablesById).find(
      (variable) =>
        variable.owner.id === `component:${boiler.id}` && variable.key === "Eff",
    );
    const generatedOutputVariable = Object.values(withBridgeCatalog.variablesById).find(
      (variable) =>
        variable.owner.id === `component:${boiler.id}` && variable.key === "REff",
    );

    expect(generatedInputVariable).toBeDefined();
    expect(generatedOutputVariable).toBeDefined();
    expect(
      withBridgeCatalog.providerIdsByVariableId[generatedInputVariable!.id].map(
        (providerId) => withBridgeCatalog.providersById[providerId].kind,
      ),
    ).toEqual(["manual", "sensor"]);
    expect(
      withBridgeCatalog.providerIdsByVariableId[generatedOutputVariable!.id].map(
        (providerId) => withBridgeCatalog.providersById[providerId].kind,
      ),
    ).toEqual(["backend"]);
    expect(withBridgeCatalog.variablesById["var:custom:ambient"]).toBeDefined();

    store.set(syncEngineeringSceneToModelAtom, []);

    const cleanedCatalog = store.get(engineeringProjectDocumentAtom).variableCatalog;

    expect(
      Object.keys(cleanedCatalog.variablesById).filter((variableId) =>
        variableId.startsWith("var:spec:"),
      ),
    ).toEqual([]);
    expect(cleanedCatalog.variablesById["var:custom:ambient"]).toBeDefined();
  });
});
