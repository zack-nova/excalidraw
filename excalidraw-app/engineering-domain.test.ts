import { describe, expect, it } from "vitest";

import {
  buildRuntimeProjection,
  bumpProjectDisplayVersion,
  bumpProjectModelVersion,
  bumpScenarioVersion,
  createCalculationRun,
  createProjectDocument,
  createScenarioDocument,
  createValueSnapshot,
  isCalculationRunStale,
  type ProjectDocument,
  type ScenarioDocument,
} from "./engineering-domain";

const createProjectFixture = (): ProjectDocument => {
  const project = createProjectDocument({
    id: "project:demo",
    meta: {
      name: "Demo project",
    },
  });

  project.variableCatalog.variablesById = {
    "var:ambient": {
      id: "var:ambient",
      owner: { kind: "environment", id: "environment:default" },
      key: "ambientTemperature",
      name: "Ambient temperature",
      valueType: "float",
      role: "input",
      stage: "raw",
    },
    "var:offset": {
      id: "var:offset",
      owner: { kind: "project", id: project.id },
      key: "offset",
      name: "Offset",
      valueType: "float",
      role: "input",
      stage: "raw",
    },
    "var:preprocess_sum": {
      id: "var:preprocess_sum",
      owner: { kind: "virtual", id: "virtual:preprocess" },
      key: "preprocessSum",
      name: "Preprocess sum",
      valueType: "float",
      role: "intermediate",
      stage: "preprocess",
    },
    "var:efficiency": {
      id: "var:efficiency",
      owner: { kind: "component", id: "component:boiler" },
      key: "efficiency",
      name: "Efficiency",
      valueType: "float",
      role: "result",
      stage: "backend",
    },
    "var:postprocess_delta": {
      id: "var:postprocess_delta",
      owner: { kind: "virtual", id: "virtual:postprocess" },
      key: "postprocessDelta",
      name: "Postprocess delta",
      valueType: "float",
      role: "intermediate",
      stage: "postprocess",
    },
  };

  project.variableCatalog.providersById = {
    "provider:ambient:manual": {
      id: "provider:ambient:manual",
      variableId: "var:ambient",
      kind: "manual",
    },
    "provider:ambient:sensor": {
      id: "provider:ambient:sensor",
      variableId: "var:ambient",
      kind: "sensor",
      measurement: "ambient_temperature",
      pointName: "ambient.temperature",
      field: "value",
    },
    "provider:offset:manual": {
      id: "provider:offset:manual",
      variableId: "var:offset",
      kind: "manual",
    },
    "provider:preprocess_sum:expression": {
      id: "provider:preprocess_sum:expression",
      variableId: "var:preprocess_sum",
      kind: "expression",
      stage: "preprocess",
      expression: 'ref("var:ambient") + ref("var:offset")',
      dependencyVariableIds: ["var:ambient", "var:offset"],
    },
    "provider:efficiency:backend": {
      id: "provider:efficiency:backend",
      variableId: "var:efficiency",
      kind: "backend",
    },
    "provider:postprocess_delta:expression": {
      id: "provider:postprocess_delta:expression",
      variableId: "var:postprocess_delta",
      kind: "expression",
      stage: "postprocess",
      expression: 'ref("var:efficiency") - ref("var:preprocess_sum")',
      dependencyVariableIds: ["var:efficiency", "var:preprocess_sum"],
    },
  };

  project.variableCatalog.providerIdsByVariableId = {
    "var:ambient": [
      "provider:ambient:manual",
      "provider:ambient:sensor",
    ],
    "var:offset": ["provider:offset:manual"],
    "var:preprocess_sum": ["provider:preprocess_sum:expression"],
    "var:efficiency": ["provider:efficiency:backend"],
    "var:postprocess_delta": ["provider:postprocess_delta:expression"],
  };

  return project;
};

const createScenarioFixture = (projectId: string): ScenarioDocument =>
  createScenarioDocument(projectId, {
    id: "scenario:demo",
    name: "Base scenario",
    manualInputs: {
      "var:ambient": createValueSnapshot({
        variableId: "var:ambient",
        value: 30,
        source: "frontend_manual_input",
        status: "ok",
        providerId: "provider:ambient:manual",
      }),
      "var:offset": createValueSnapshot({
        variableId: "var:offset",
        value: 5,
        source: "frontend_manual_input",
        status: "ok",
        providerId: "provider:offset:manual",
      }),
    },
  });

describe("engineering domain runtime projection", () => {
  it("resolves manual, backend, preprocess, and postprocess values into one runtime projection", () => {
    const project = createProjectFixture();
    const scenario = createScenarioFixture(project.id);
    const run = createCalculationRun({
      id: "run:demo",
      projectId: project.id,
      scenarioId: scenario.id,
      basedOn: {
        modelVersion: project.revisions.modelVersion,
        scenarioVersion: scenario.revisions.scenarioVersion,
      },
      status: "success",
      resultValues: {
        "var:efficiency": createValueSnapshot({
          variableId: "var:efficiency",
          value: 80,
          source: "backend_calculation",
          status: "ok",
          providerId: "provider:efficiency:backend",
          runId: "run:demo",
        }),
      },
      diagnostics: [],
    });

    const projection = buildRuntimeProjection({
      project,
      scenario,
      calculationRun: run,
      liveSnapshots: {
        "var:ambient": createValueSnapshot({
          variableId: "var:ambient",
          value: 12,
          source: "backend_db_pull",
          status: "ok",
          providerId: "provider:ambient:sensor",
        }),
      },
    });

    expect(projection.activeRun).toEqual({
      runId: "run:demo",
      status: "success",
      isStale: false,
    });
    expect(projection.effectiveValues["var:ambient"]).toMatchObject({
      value: 30,
      source: "frontend_manual_input",
      providerId: "provider:ambient:manual",
      status: "ok",
    });
    expect(projection.effectiveValues["var:preprocess_sum"]).toMatchObject({
      value: 35,
      source: "frontend_computed",
      providerId: "provider:preprocess_sum:expression",
      status: "ok",
    });
    expect(projection.effectiveValues["var:efficiency"]).toMatchObject({
      value: 80,
      source: "backend_calculation",
      providerId: "provider:efficiency:backend",
      status: "ok",
    });
    expect(projection.effectiveValues["var:postprocess_delta"]).toMatchObject({
      value: 45,
      source: "frontend_computed",
      providerId: "provider:postprocess_delta:expression",
      status: "ok",
    });
    expect(projection.diagnostics).toEqual([]);
  });

  it("marks a calculation run stale only when model or scenario versions change", () => {
    const project = createProjectFixture();
    const scenario = createScenarioFixture(project.id);
    const run = createCalculationRun({
      id: "run:stale-check",
      projectId: project.id,
      scenarioId: scenario.id,
      basedOn: {
        modelVersion: project.revisions.modelVersion,
        scenarioVersion: scenario.revisions.scenarioVersion,
      },
      status: "success",
      resultValues: {},
      diagnostics: [],
    });

    expect(isCalculationRunStale(run, project, scenario)).toBe(false);
    expect(
      isCalculationRunStale(run, bumpProjectDisplayVersion(project), scenario),
    ).toBe(false);
    expect(isCalculationRunStale(run, bumpProjectModelVersion(project), scenario)).toBe(
      true,
    );
    expect(isCalculationRunStale(run, project, bumpScenarioVersion(scenario))).toBe(
      true,
    );
  });

  it("detects cyclic expression providers and reports them as diagnostics", () => {
    const project = createProjectDocument({
      id: "project:cycle",
      meta: {
        name: "Cycle project",
      },
    });

    project.variableCatalog.variablesById = {
      "var:a": {
        id: "var:a",
        owner: { kind: "virtual", id: "virtual:a" },
        key: "a",
        name: "A",
        valueType: "float",
        role: "intermediate",
        stage: "preprocess",
      },
      "var:b": {
        id: "var:b",
        owner: { kind: "virtual", id: "virtual:b" },
        key: "b",
        name: "B",
        valueType: "float",
        role: "intermediate",
        stage: "preprocess",
      },
    };
    project.variableCatalog.providersById = {
      "provider:a": {
        id: "provider:a",
        variableId: "var:a",
        kind: "expression",
        stage: "preprocess",
        expression: 'ref("var:b") + 1',
        dependencyVariableIds: ["var:b"],
      },
      "provider:b": {
        id: "provider:b",
        variableId: "var:b",
        kind: "expression",
        stage: "preprocess",
        expression: 'ref("var:a") + 1',
        dependencyVariableIds: ["var:a"],
      },
    };
    project.variableCatalog.providerIdsByVariableId = {
      "var:a": ["provider:a"],
      "var:b": ["provider:b"],
    };

    const scenario = createScenarioDocument(project.id, {
      id: "scenario:cycle",
      name: "Cycle scenario",
    });

    const projection = buildRuntimeProjection({
      project,
      scenario,
    });

    expect(projection.effectiveValues["var:a"]).toMatchObject({
      status: "cyclic",
      providerId: "provider:a",
    });
    expect(projection.effectiveValues["var:b"]).toMatchObject({
      status: "cyclic",
      providerId: "provider:b",
    });
    expect(
      projection.diagnostics.some((issue) => issue.code === "expression_cycle"),
    ).toBe(true);
  });
});
