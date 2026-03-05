import { describe, expect, it } from "vitest";

import {
  buildEngineeringDataRowsFromRuntimeProjection,
  createEngineeringDataContext,
  renderEngineeringTemplate,
} from "./engineeringData";
import {
  buildRuntimeProjection,
  createProjectDocument,
  createScenarioDocument,
  createValueSnapshot,
} from "../engineering-domain";

describe("engineering data templates", () => {
  it("renders variables, normalized aliases, and arithmetic expressions", () => {
    const context = createEngineeringDataContext([
      {
        id: "var:pressure",
        alias: "pressure",
        name: "pressure",
        value: 12.5,
        unit: "kPa",
      },
      {
        id: "var:current",
        alias: "current",
        name: "current",
        value: 4,
        unit: "A",
      },
      {
        id: "var:flow-rate",
        alias: "flow-rate",
        name: "flow-rate",
        value: 10,
      },
    ]);

    expect(
      renderEngineeringTemplate(
        "P={{pressure}} {{items.pressure.unit}}, I={{current}} {{items.current.unit}}, Power={{pressure * current}}, Flow={{flow_rate}}",
        context,
      ),
    ).toBe("P=12.5 kPa, I=4 A, Power=50, Flow=10");
  });

  it("keeps unresolved placeholders and invalid expressions unchanged", () => {
    const context = createEngineeringDataContext([
      {
        id: "var:temperature",
        alias: "temperature",
        name: "temperature",
        value: 28,
      },
    ]);

    expect(
      renderEngineeringTemplate(
        "T={{temperature}}, Missing={{unknown_value}}, Broken={{temperature * }}",
        context,
      ),
    ).toBe(
      "T=28, Missing={{unknown_value}}, Broken={{temperature * }}",
    );
  });

  it("does not resolve placeholders from name or name_cn without alias", () => {
    const context = createEngineeringDataContext([
      {
        id: "var:pump_speed",
        name: "pump_speed",
        name_cn: "泵速",
        value: 1450,
      },
    ]);

    expect(
      renderEngineeringTemplate(
        "EN={{pump_speed}}, CN={{泵速}}",
        context,
      ),
    ).toBe("EN={{pump_speed}}, CN={{泵速}}");
  });

  it("supports direct alias field and id-addressable data map access", () => {
    const pressureId = "var:pressure";
    const currentId = "var:current";
    const context = createEngineeringDataContext([
      {
        id: pressureId,
        alias: "pressure",
        value: 16,
        unit: "kPa",
      },
      {
        id: currentId,
        alias: "current",
        value: 5,
        unit: "A",
      },
    ]);

    expect(
      renderEngineeringTemplate(
        `Alias={{pressure}}, ID={{data[${pressureId}].value}}, Quoted={{data["${currentId}"].value}}, Calc={{data[${pressureId}].value * current}}`,
        context,
      ),
    ).toBe("Alias=16, ID=16, Quoted=5, Calc=80");
  });

  it("supports conditional aggregations and round()", () => {
    const context = createEngineeringDataContext([
      {
        id: "var:pump-pressure-1",
        alias: "pressure_1",
        group: "pump",
        measurement: "pressure",
        value: 10.1,
        tags: {
          area: "A1",
        },
      },
      {
        id: "var:pump-pressure-2",
        alias: "pressure_2",
        group: "pump",
        measurement: "pressure",
        value: 20.5,
        tags: {
          area: "A1",
        },
      },
      {
        id: "var:pump-pressure-3",
        alias: "pressure_3",
        group: "pump",
        measurement: "pressure",
        value: 31.2,
        tags: {
          area: "A2",
        },
      },
      {
        id: "var:valve-pressure-1",
        alias: "valve_pressure",
        group: "valve",
        measurement: "pressure",
        value: 8.5,
        tags: {
          area: "A1",
        },
      },
    ]);

    expect(
      renderEngineeringTemplate(
        'Sum={{sumWhere("value", "group", "pump")}}, Count={{countWhere("group", "pump", "tags.area", "A1")}}, Avg={{round(avgWhere("value", "group", "pump", "tags.area", "A1"), 2)}}, Min={{minWhere("value", "group", "pump")}}, Max={{maxWhere("value", "group", "pump")}}, Rounded={{round(pressure_1 / 3, 1)}}',
        context,
      ),
    ).toBe(
      "Sum=61.8, Count=2, Avg=15.3, Min=10.1, Max=31.2, Rounded=3.4",
    );
  });

  it("throws immediately when alias points to different variable ids", () => {
    expect(() =>
      createEngineeringDataContext([
        {
          id: "var:a",
          alias: "dup_alias",
          value: 1,
        },
        {
          id: "var:b",
          alias: "dup_alias",
          value: 2,
        },
      ]),
    ).toThrow(/alias/i);
  });

  it("builds runtime rows from engineering domain and supports data[id] + where", () => {
    const project = createProjectDocument({
      id: "project:runtime",
    });
    project.variableCatalog.variablesById = {
      "var:ambient": {
        id: "var:ambient",
        owner: { kind: "environment", id: "environment:default" },
        key: "ambient",
        name: "Ambient",
        valueType: "float",
        role: "input",
        stage: "raw",
        displayUnit: "℃",
      },
    };
    project.variableCatalog.providersById = {
      "provider:ambient:manual": {
        id: "provider:ambient:manual",
        variableId: "var:ambient",
        kind: "manual",
      },
    };
    project.variableCatalog.providerIdsByVariableId = {
      "var:ambient": ["provider:ambient:manual"],
    };
    const scenario = createScenarioDocument(project.id, {
      manualInputs: {
        "var:ambient": createValueSnapshot({
          variableId: "var:ambient",
          value: 25,
          source: "frontend_manual_input",
          status: "ok",
          providerId: "provider:ambient:manual",
        }),
      },
    });
    const runtimeProjection = buildRuntimeProjection({
      project,
      scenario,
    });

    const context = createEngineeringDataContext(
      buildEngineeringDataRowsFromRuntimeProjection({
        project,
        runtimeProjection,
      }),
    );

    expect(
      renderEngineeringTemplate(
        'Ambient={{data[var:ambient].value}}, Sum={{sumWhere("value", "group", "input")}}',
        context,
      ),
    ).toBe("Ambient=25, Sum=25");
  });
});
