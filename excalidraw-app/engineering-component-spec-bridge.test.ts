import { describe, expect, it } from "vitest";

import type { ComponentSpec } from "./component-spec-store";
import {
  buildVariableCatalogFromLoadedComponentSpecs,
  isSpecManagedVariableId,
} from "./engineering-component-spec-bridge";
import { createProjectDocument, type VariableCatalogState } from "./engineering-domain";

const createParameter = ({
  id,
  key,
  name,
  nameCn,
  source,
  unit = null,
}: {
  id: string;
  key: string;
  name: string;
  nameCn: string;
  source: string;
  unit?: string | null;
}) => ({
  id,
  uuid: null,
  key,
  name,
  nameCn,
  source,
  valueType: "float",
  unit,
  defaultValue: null,
  tips: null,
  enumOptions: null,
  physicalEntityType: "component",
  group: null,
  required: null,
  inputStatus: null,
  allowNotDisplay: null,
  tpisKey: key,
  tpisOperationMode: null,
  tpisExtraInfo: null,
  hasCurveData: false,
});

const createSpec = (): ComponentSpec => ({
  componentType: "Boiler",
  id: null,
  uuid: null,
  group: null,
  icon: null,
  measured: null,
  operationMode: null,
  data: null,
  inputParameters: [
    createParameter({
      id: "Eff",
      key: "Eff",
      name: "Eff",
      nameCn: "锅炉效率",
      source: "frontend_manual_input",
      unit: "%",
    }),
  ],
  outputParameters: [
    createParameter({
      id: "REff",
      key: "REff",
      name: "REff",
      nameCn: "锅炉效率结果",
      source: "backend_calculation",
      unit: "%",
    }),
  ],
});

const createExistingCatalog = (): VariableCatalogState => ({
  variablesById: {
    "var:custom:ambient": {
      id: "var:custom:ambient",
      owner: { kind: "environment", id: "environment:default" },
      key: "ambient",
      name: "Ambient",
      valueType: "float",
      role: "input",
      stage: "raw",
    },
  },
  providersById: {
    "provider:custom:ambient:manual": {
      id: "provider:custom:ambient:manual",
      variableId: "var:custom:ambient",
      kind: "manual",
    },
  },
  providerIdsByVariableId: {
    "var:custom:ambient": ["provider:custom:ambient:manual"],
  },
});

describe("engineering component spec bridge", () => {
  it("builds input/output variables and providers from loaded component specs while preserving custom variables", () => {
    const project = createProjectDocument({
      id: "project:bridge",
    });
    project.topology.componentsById = {
      "component:boiler": {
        id: "component:boiler",
        templateKey: "Boiler",
        name: "锅炉",
        anchorIds: [],
        props: {},
      },
      "component:shape-custom": {
        id: "component:shape-custom",
        name: "Custom shape",
        anchorIds: [],
        props: {},
      },
    };
    project.variableCatalog = createExistingCatalog();

    const nextCatalog = buildVariableCatalogFromLoadedComponentSpecs(
      project,
      {
        Boiler: createSpec(),
      },
    );

    expect(nextCatalog.variablesById["var:custom:ambient"]).toBeDefined();
    expect(nextCatalog.providersById["provider:custom:ambient:manual"]).toBeDefined();

    const generatedInputVariable = Object.values(nextCatalog.variablesById).find(
      (variable) =>
        isSpecManagedVariableId(variable.id) &&
        variable.owner.id === "component:boiler" &&
        variable.key === "Eff",
    );
    const generatedOutputVariable = Object.values(nextCatalog.variablesById).find(
      (variable) =>
        isSpecManagedVariableId(variable.id) &&
        variable.owner.id === "component:boiler" &&
        variable.key === "REff",
    );

    expect(generatedInputVariable).toMatchObject({
      role: "input",
      stage: "raw",
      canonicalUnit: "%",
    });
    expect(generatedOutputVariable).toMatchObject({
      role: "result",
      stage: "backend",
      canonicalUnit: "%",
    });

    expect(
      nextCatalog.providerIdsByVariableId[generatedInputVariable!.id].map(
        (providerId) => nextCatalog.providersById[providerId].kind,
      ),
    ).toEqual(["manual", "sensor"]);
    expect(
      nextCatalog.providerIdsByVariableId[generatedOutputVariable!.id].map(
        (providerId) => nextCatalog.providersById[providerId].kind,
      ),
    ).toEqual(["backend"]);
  });
});
