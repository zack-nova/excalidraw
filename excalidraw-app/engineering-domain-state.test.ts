import { createStore } from "jotai";
import { describe, expect, it } from "vitest";
import {
  createProjectDocument,
  createScenarioDocument,
  createValueSnapshot,
  type ProjectDocument,
  type ScenarioDocument,
} from "./engineering-domain";
import {
  applyEngineeringProjectMutationAtom,
  applyEngineeringScenarioMutationAtom,
  refreshEngineeringLiveSnapshotsAtom,
  engineeringCurrentCalculationRunAtom,
  engineeringIndicatorFormulaSnapshotsAtom,
  engineeringLastCalculationRequestAtom,
  engineeringLiveSnapshotsAtom,
  runEngineeringPeriodicCalculationTickAtom,
  engineeringProjectDocumentAtom,
  engineeringRunRuntimeAtom,
  engineeringCalculationRunsAtom,
  engineeringRuntimeProjectionAtom,
  engineeringScenarioDocumentAtom,
  upsertEngineeringIndicatorFormulaAtom,
  upsertEngineeringPointBindingAtom,
  requestEngineeringCalculationAtom,
  engineeringSelectedCalculationRunIdAtom,
  upsertEngineeringCalculationRunAtom,
} from "./engineering-domain-state";

const createProjectFixture = (): ProjectDocument => {
  const project = createProjectDocument({
    id: "project:store",
    meta: {
      name: "Store project",
    },
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
    },
    "var:load": {
      id: "var:load",
      owner: { kind: "virtual", id: "virtual:load" },
      key: "load",
      name: "Load",
      valueType: "float",
      role: "intermediate",
      stage: "preprocess",
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
      measurement: "ambient",
      pointName: "ambient",
      field: "value",
    },
    "provider:load:expression": {
      id: "provider:load:expression",
      variableId: "var:load",
      kind: "expression",
      stage: "preprocess",
      expression: 'ref("var:ambient") * 2',
      dependencyVariableIds: ["var:ambient"],
    },
  };
  project.variableCatalog.providerIdsByVariableId = {
    "var:ambient": [
      "provider:ambient:manual",
      "provider:ambient:sensor",
    ],
    "var:load": ["provider:load:expression"],
  };

  return project;
};

const createScenarioFixture = (projectId: string): ScenarioDocument =>
  createScenarioDocument(projectId, {
    id: "scenario:store",
    name: "Store scenario",
  });

describe("engineering domain state", () => {
  it("marks the selected calculation run stale when the model version changes through the store", () => {
    const store = createStore();
    const project = createProjectFixture();
    const scenario = createScenarioFixture(project.id);
    const run = {
      id: "run:store",
      projectId: project.id,
      scenarioId: scenario.id,
      basedOn: {
        modelVersion: project.revisions.modelVersion,
        scenarioVersion: scenario.revisions.scenarioVersion,
      },
      status: "success" as const,
      startedAt: 1_700_000_000_000,
      finishedAt: 1_700_000_000_001,
      resultValues: {},
      diagnostics: [],
    };

    store.set(engineeringProjectDocumentAtom, project);
    store.set(engineeringScenarioDocumentAtom, scenario);
    store.set(upsertEngineeringCalculationRunAtom, run);
    store.set(engineeringSelectedCalculationRunIdAtom, run.id);

    expect(store.get(engineeringCurrentCalculationRunAtom)).toEqual({
      run,
      isStale: false,
    });

    store.set(applyEngineeringProjectMutationAtom, {
      scope: "model",
      updater: (current) => ({
        ...current,
        meta: {
          ...current.meta,
          name: "Store project v2",
        },
      }),
    });

    expect(store.get(engineeringCurrentCalculationRunAtom)).toEqual({
      run,
      isStale: true,
    });
  });

  it("rebuilds runtime projection from store atoms and bumps scenario version on manual input changes", () => {
    const store = createStore();
    const project = createProjectFixture();
    const scenario = createScenarioFixture(project.id);

    store.set(engineeringProjectDocumentAtom, project);
    store.set(engineeringScenarioDocumentAtom, scenario);
    store.set(engineeringLiveSnapshotsAtom, {
      "var:ambient": createValueSnapshot({
        variableId: "var:ambient",
        value: 11,
        source: "backend_db_pull",
        status: "ok",
        providerId: "provider:ambient:sensor",
      }),
    });

    expect(store.get(engineeringRuntimeProjectionAtom).effectiveValues["var:load"]).toMatchObject(
      {
        value: 22,
        source: "frontend_computed",
      },
    );

    const initialScenarioVersion = store.get(engineeringScenarioDocumentAtom)
      .revisions.scenarioVersion;

    store.set(applyEngineeringScenarioMutationAtom, {
      bumpVersion: true,
      updater: (current) => ({
        ...current,
        manualInputs: {
          ...current.manualInputs,
          "var:ambient": createValueSnapshot({
            variableId: "var:ambient",
            value: 20,
            source: "frontend_manual_input",
            status: "ok",
            providerId: "provider:ambient:manual",
          }),
        },
      }),
    });

    expect(store.get(engineeringScenarioDocumentAtom).revisions.scenarioVersion).toBe(
      initialScenarioVersion + 1,
    );
    expect(store.get(engineeringRuntimeProjectionAtom).effectiveValues["var:ambient"]).toMatchObject(
      {
        value: 20,
        source: "frontend_manual_input",
      },
    );
    expect(store.get(engineeringRuntimeProjectionAtom).effectiveValues["var:load"]).toMatchObject(
      {
        value: 40,
        source: "frontend_computed",
      },
    );
  });

  it("builds calculation request payload from scenario manual inputs using variable ids", () => {
    const store = createStore();
    const project = createProjectFixture();
    const scenario = createScenarioFixture(project.id);
    const requestedAt = 1_700_000_000_000;

    scenario.manualInputs["var:ambient"] = createValueSnapshot({
      variableId: "var:ambient",
      value: 35,
      source: "frontend_manual_input",
      status: "ok",
      providerId: "provider:ambient:manual",
    });
    scenario.sourcePolicyOverrides["var:ambient"] = {
      preferredProviderKinds: ["manual"],
    };

    store.set(engineeringProjectDocumentAtom, project);
    store.set(engineeringScenarioDocumentAtom, scenario);

    store.set(requestEngineeringCalculationAtom, {
      requestedAt,
    });

    const requestPayload = store.get(engineeringLastCalculationRequestAtom);

    expect(requestPayload).toMatchObject({
      projectId: project.id,
      scenarioId: scenario.id,
      requestedAt,
      basedOn: {
        modelVersion: project.revisions.modelVersion,
        schemaVersion: project.revisions.schemaVersion,
        scenarioVersion: scenario.revisions.scenarioVersion,
      },
      sourcePolicyOverrides: {
        "var:ambient": {
          preferredProviderKinds: ["manual"],
        },
      },
      manualInputs: [
        {
          variableId: "var:ambient",
          value: 35,
          providerId: "provider:ambient:manual",
          valueType: "float",
        },
      ],
    });

    expect(requestPayload?.manualInputs[0]).not.toHaveProperty("name");
    expect(requestPayload?.topology).toEqual(project.topology);
  });

  it("creates a local mock calculation run and tracks run runtime state", async () => {
    const store = createStore();
    const project = createProjectFixture();
    const scenario = createScenarioFixture(project.id);
    const requestedAt = 1_700_000_000_001;

    store.set(engineeringProjectDocumentAtom, project);
    store.set(engineeringScenarioDocumentAtom, scenario);

    await store.set(requestEngineeringCalculationAtom, {
      requestedAt,
    });

    const selectedRunId = store.get(engineeringSelectedCalculationRunIdAtom);
    expect(selectedRunId).toMatch(/^run:mock:/);
    expect(store.get(engineeringCalculationRunsAtom)[selectedRunId!]).toMatchObject({
      id: selectedRunId,
      status: "success",
    });
    expect(store.get(engineeringRunRuntimeAtom)).toMatchObject({
      activeRunId: selectedRunId,
      status: "success",
      errorMessage: null,
    });
  });

  it("stores point bindings and refreshes live monitor snapshots from mock source", () => {
    const store = createStore();
    const project = createProjectFixture();
    const scenario = createScenarioFixture(project.id);

    store.set(engineeringProjectDocumentAtom, project);
    store.set(engineeringScenarioDocumentAtom, scenario);

    store.set(upsertEngineeringPointBindingAtom, {
      variableId: "var:ambient",
      measurement: "ambient.temperature",
      pointName: "sensor.ambient.t",
      field: "value",
    });

    store.set(refreshEngineeringLiveSnapshotsAtom);
    const firstSnapshot = store.get(engineeringLiveSnapshotsAtom)["var:ambient"];

    expect(store.get(engineeringScenarioDocumentAtom).pointBindings["var:ambient"]).toMatchObject(
      {
        variableId: "var:ambient",
        measurement: "ambient.temperature",
        pointName: "sensor.ambient.t",
        field: "value",
      },
    );
    expect(firstSnapshot).toMatchObject({
      variableId: "var:ambient",
      source: "backend_db_pull",
      status: "ok",
    });

    store.set(refreshEngineeringLiveSnapshotsAtom);
    const secondSnapshot = store.get(engineeringLiveSnapshotsAtom)["var:ambient"];
    expect(secondSnapshot?.timestamp).toBeGreaterThanOrEqual(firstSnapshot?.timestamp || 0);
  });

  it("evaluates indicator formulas from manual + live values and exposes snapshots", () => {
    const store = createStore();
    const project = createProjectFixture();
    const scenario = createScenarioFixture(project.id);

    store.set(engineeringProjectDocumentAtom, project);
    store.set(engineeringScenarioDocumentAtom, {
      ...scenario,
      manualInputs: {
        "var:load": createValueSnapshot({
          variableId: "var:load",
          value: 5,
          source: "frontend_manual_input",
          status: "ok",
        }),
      },
    });
    store.set(engineeringLiveSnapshotsAtom, {
      "var:ambient": createValueSnapshot({
        variableId: "var:ambient",
        value: 20,
        source: "backend_db_pull",
        status: "ok",
      }),
    });

    store.set(upsertEngineeringIndicatorFormulaAtom, {
      id: "formula:indicator:a",
      name: "指标A",
      expression: 'ref("var:ambient") + ref("var:load")',
      outputVariableId: "var:indicator:a",
      scope: "display",
      enabled: true,
    });

    expect(store.get(engineeringIndicatorFormulaSnapshotsAtom)["var:indicator:a"]).toMatchObject(
      {
        variableId: "var:indicator:a",
        value: 25,
        source: "frontend_computed",
        status: "ok",
      },
    );
  });

  it("periodic calculation tick uses latest live snapshots and formula values", async () => {
    const store = createStore();
    const project = createProjectFixture();
    const scenario = createScenarioFixture(project.id);

    store.set(engineeringProjectDocumentAtom, project);
    store.set(engineeringScenarioDocumentAtom, {
      ...scenario,
      manualInputs: {
        "var:load": createValueSnapshot({
          variableId: "var:load",
          value: 3,
          source: "frontend_manual_input",
          status: "ok",
        }),
      },
    });
    store.set(upsertEngineeringPointBindingAtom, {
      variableId: "var:ambient",
      measurement: "ambient.temperature",
      pointName: "sensor.ambient.t",
      field: "value",
    });
    store.set(engineeringLiveSnapshotsAtom, {
      "var:ambient": createValueSnapshot({
        variableId: "var:ambient",
        value: 12,
        source: "backend_db_pull",
        status: "ok",
      }),
    });
    store.set(upsertEngineeringIndicatorFormulaAtom, {
      id: "formula:indicator:b",
      expression: 'ref("var:ambient") * ref("var:load")',
      outputVariableId: "var:indicator:b",
      scope: "calculation",
      enabled: true,
    });

    await store.set(runEngineeringPeriodicCalculationTickAtom);

    const runId = store.get(engineeringSelectedCalculationRunIdAtom);
    const run = runId ? store.get(engineeringCalculationRunsAtom)[runId] : null;
    expect(run).toBeTruthy();
    expect(run?.resultValues["var:ambient"]).toMatchObject({
      value: 12,
      source: "backend_db_pull",
    });
    expect(run?.resultValues["var:load"]).toMatchObject({
      value: 3,
      source: "frontend_manual_input",
    });
    expect(run?.resultValues["var:indicator:b"]).toMatchObject({
      value: 36,
      source: "frontend_computed",
      status: "ok",
    });
  });
});
