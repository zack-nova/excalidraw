import { createStore } from "jotai";
import { describe, expect, it } from "vitest";

import {
  createCalculationRun,
  createProjectDocument,
  createScenarioDocument,
  createValueSnapshot,
  type ProjectDocument,
  type ScenarioDocument,
} from "./engineering-domain";
import {
  applyEngineeringProjectMutationAtom,
  applyEngineeringScenarioMutationAtom,
  engineeringCurrentCalculationRunAtom,
  engineeringLiveSnapshotsAtom,
  engineeringProjectDocumentAtom,
  engineeringRuntimeProjectionAtom,
  engineeringScenarioDocumentAtom,
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
    const run = createCalculationRun({
      id: "run:store",
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
});
