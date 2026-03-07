import { describe, expect, it } from "vitest";

import type { ComponentSpec } from "../component-spec-store";
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

const createSpecWithInputOrder = (keys: string[]): ComponentSpec => ({
  componentType: "Boiler",
  id: null,
  uuid: null,
  group: null,
  icon: null,
  measured: null,
  operationMode: null,
  data: null,
  inputParameters: keys.map((key) =>
    createParameter({
      id: key,
      key,
      name: key,
      nameCn: key,
      source: "frontend_manual_input",
      unit: "%",
    }),
  ),
  outputParameters: [],
});

const createSpecWithAnchorParameters = (): ComponentSpec => ({
  componentType: "Boiler",
  id: null,
  uuid: null,
  group: null,
  icon: null,
  measured: null,
  operationMode: null,
  data: {
    anchors: [
      {
        data: {
          interface_type: "Fuel",
          name: "Fuel",
          name_cn: "燃料",
          material_type: "coal",
        },
        parameters: [
          {
            uuid: null,
            name: "Q",
            name_cn: "流量",
            source: "backend_calculation",
            value_type: "float",
            unit: "t/h",
            enum_options: [],
            physical_entity_type: "anchor",
            tpis_key: "Q",
            tpis_operation_mode: ["design_mode"],
            require: false,
            input_status: "unknown",
            allow_not_display: false,
            tpis_extra_info: "",
          },
        ],
      },
    ],
  },
  inputParameters: [],
  outputParameters: [],
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
    const generatedInputSensorProviderId =
      nextCatalog.providerIdsByVariableId[generatedInputVariable!.id].find(
        (providerId) => nextCatalog.providersById[providerId].kind === "sensor",
      );
    expect(generatedInputSensorProviderId).toBeDefined();
    expect(
      nextCatalog.providersById[generatedInputSensorProviderId!],
    ).toMatchObject({
      pointName: "component:boiler.Eff",
    });
    expect(
      nextCatalog.providerIdsByVariableId[generatedOutputVariable!.id].map(
        (providerId) => nextCatalog.providersById[providerId].kind,
      ),
    ).toEqual(["backend"]);
  });

  it("bridges anchor output parameters to anchor-owned backend variables", () => {
    const project = createProjectDocument({
      id: "project:bridge-anchor",
    });
    project.topology.componentsById = {
      "component:boiler": {
        id: "component:boiler",
        templateKey: "Boiler",
        name: "锅炉",
        anchorIds: ["anchor:boiler:fuel"],
        props: {},
      },
    };
    project.topology.anchorsById = {
      "anchor:boiler:fuel": {
        id: "anchor:boiler:fuel",
        componentId: "component:boiler",
        key: "Fuel",
        name: "燃料",
        medium: "coal",
      },
    };

    const nextCatalog = buildVariableCatalogFromLoadedComponentSpecs(
      project,
      {
        Boiler: createSpecWithAnchorParameters(),
      },
    );

    const anchorVariable = Object.values(nextCatalog.variablesById).find(
      (variable) =>
        variable.owner.kind === "anchor" &&
        variable.owner.id === "anchor:boiler:fuel" &&
        variable.key === "Q",
    );

    expect(anchorVariable).toMatchObject({
      role: "result",
      stage: "backend",
      canonicalUnit: "t/h",
      tags: expect.objectContaining({
        section: "anchor_output",
        materialType: "coal",
      }),
    });
    expect(anchorVariable?.backend).toMatchObject({
      tpisKey: "Q",
    });
    expect(
      nextCatalog.providerIdsByVariableId[anchorVariable!.id].map(
        (providerId) => nextCatalog.providersById[providerId].kind,
      ),
    ).toEqual(["backend"]);
  });

  it("keeps generated variable IDs stable when input parameter order changes", () => {
    const project = createProjectDocument({
      id: "project:bridge-stable-id",
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

    const catalogV1 = buildVariableCatalogFromLoadedComponentSpecs(
      project,
      {
        Boiler: createSpecWithInputOrder(["A", "B", "C"]),
      },
    );
    const idsByKeyV1 = Object.values(catalogV1.variablesById)
      .filter((variable) => variable.owner.id === "component:boiler")
      .reduce<Record<string, string>>((result, variable) => {
        result[variable.key] = variable.id;
        return result;
      }, {});

    const catalogV2 = buildVariableCatalogFromLoadedComponentSpecs(
      {
        ...project,
        variableCatalog: catalogV1,
      },
      {
        Boiler: createSpecWithInputOrder(["C", "A", "B"]),
      },
    );
    const idsByKeyV2 = Object.values(catalogV2.variablesById)
      .filter((variable) => variable.owner.id === "component:boiler")
      .reduce<Record<string, string>>((result, variable) => {
        result[variable.key] = variable.id;
        return result;
      }, {});

    expect(idsByKeyV2).toMatchObject(idsByKeyV1);
  });
});
