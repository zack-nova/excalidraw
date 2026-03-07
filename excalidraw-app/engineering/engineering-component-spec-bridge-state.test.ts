import { createStore } from "jotai";
import { describe, expect, it, vi } from "vitest";

import * as bridgeModule from "./engineering-component-spec-bridge";
import { componentSpecCatalogAtom } from "../component-spec-store";
import { createProjectDocument } from "./engineering-domain";
import { engineeringProjectDocumentAtom } from "./engineering-domain-state";
import { syncEngineeringComponentSpecBridgeAtom } from "./engineering-component-spec-bridge-state";

describe("engineering component spec bridge state", () => {
  it("skips rebuilding variable catalog when model/spec dependencies are unchanged", () => {
    const store = createStore();
    const project = createProjectDocument({
      id: "project:bridge-memo",
    });
    project.topology.componentsById = {
      "component:boiler": {
        id: "component:boiler",
        templateKey: "Boiler",
        name: "锅炉",
        anchorIds: [],
        props: {},
      },
    };

    store.set(engineeringProjectDocumentAtom, project);
    store.set(componentSpecCatalogAtom, {
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
          outputParameters: [],
        },
      },
      loadStatusByType: {
        Boiler: "ready",
      },
      errorsByType: {},
    });

    const buildCatalogSpy = vi.spyOn(
      bridgeModule,
      "buildVariableCatalogFromLoadedComponentSpecs",
    );

    store.set(syncEngineeringComponentSpecBridgeAtom);
    const firstCallCount = buildCatalogSpy.mock.calls.length;

    store.set(syncEngineeringComponentSpecBridgeAtom);
    const secondCallCount = buildCatalogSpy.mock.calls.length;

    expect(firstCallCount).toBeGreaterThan(0);
    expect(secondCallCount).toBe(firstCallCount);
  });
});
