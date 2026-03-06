import { createStore } from "jotai";
import { afterEach, describe, expect, it, vi } from "vitest";
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

const mockJsonResponse = (body: unknown, status = 200) =>
  Promise.resolve(
    new Response(JSON.stringify(body), {
      status,
      headers: {
        "Content-Type": "application/json",
      },
    }),
  );

type GlobalWithEngineeringBackend = typeof globalThis & {
  __EXCALIDRAW_ENGINEERING_BACKEND_BASE_URL__?: string;
};

describe("engineering domain state", () => {
  afterEach(() => {
    delete (globalThis as GlobalWithEngineeringBackend)
      .__EXCALIDRAW_ENGINEERING_BACKEND_BASE_URL__;
    vi.restoreAllMocks();
  });

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

  it("creates session and requests calculation run from backend when backend URL is configured", async () => {
    const store = createStore();
    const project = createProjectFixture();
    const scenario = createScenarioFixture(project.id);
    const requestedAt = 1_700_000_000_123;
    const fetchMock = vi.fn();

    (globalThis as GlobalWithEngineeringBackend).__EXCALIDRAW_ENGINEERING_BACKEND_BASE_URL__ =
      "http://127.0.0.1:18080";
    fetchMock.mockResolvedValueOnce(
      await mockJsonResponse({
        sessionId: "session:api-1",
        acceptedModelVersion: project.revisions.modelVersion,
        acceptedScenarioVersion: scenario.revisions.scenarioVersion,
      }),
    );
    fetchMock.mockResolvedValueOnce(
      await mockJsonResponse({
        runId: "run:api-1",
        scenarioVersion: scenario.revisions.scenarioVersion,
        status: "success",
        startedAt: requestedAt,
        finishedAt: requestedAt + 1000,
        resultValues: {
          "var:ambient": {
            variableId: "var:ambient",
            value: 22,
            source: "backend_db_pull",
            status: "ok",
            timestamp: requestedAt + 1000,
          },
        },
        diagnostics: [],
      }),
    );
    vi.stubGlobal("fetch", fetchMock);

    store.set(engineeringProjectDocumentAtom, project);
    store.set(engineeringScenarioDocumentAtom, scenario);
    await store.set(requestEngineeringCalculationAtom, {
      requestedAt,
    });

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(fetchMock.mock.calls[0]?.[0]).toBe(
      "http://127.0.0.1:18080/api/v1/sessions",
    );
    expect(fetchMock.mock.calls[1]?.[0]).toBe(
      "http://127.0.0.1:18080/api/v1/runs",
    );
    expect(store.get(engineeringSelectedCalculationRunIdAtom)).toBe("run:api-1");
    expect(store.get(engineeringRunRuntimeAtom)).toMatchObject({
      activeRunId: "run:api-1",
      status: "success",
      errorMessage: null,
    });
  });

  it("updates session scenario on version bump before requesting backend run", async () => {
    const store = createStore();
    const project = createProjectFixture();
    const scenario = createScenarioFixture(project.id);
    const fetchMock = vi.fn();

    (globalThis as GlobalWithEngineeringBackend).__EXCALIDRAW_ENGINEERING_BACKEND_BASE_URL__ =
      "http://127.0.0.1:18080";
    fetchMock.mockResolvedValueOnce(
      await mockJsonResponse({
        sessionId: "session:api-2",
        acceptedModelVersion: project.revisions.modelVersion,
        acceptedScenarioVersion: 1,
      }),
    );
    fetchMock.mockResolvedValueOnce(
      await mockJsonResponse({
        runId: "run:api-2-1",
        scenarioVersion: 1,
        status: "success",
        startedAt: 1_700_000_000_200,
        finishedAt: 1_700_000_000_210,
        resultValues: {},
        diagnostics: [],
      }),
    );
    fetchMock.mockResolvedValueOnce(
      await mockJsonResponse({
        sessionId: "session:api-2",
        acceptedScenarioVersion: 2,
      }),
    );
    fetchMock.mockResolvedValueOnce(
      await mockJsonResponse({
        runId: "run:api-2-2",
        scenarioVersion: 2,
        status: "success",
        startedAt: 1_700_000_000_220,
        finishedAt: 1_700_000_000_230,
        resultValues: {},
        diagnostics: [],
      }),
    );
    vi.stubGlobal("fetch", fetchMock);

    store.set(engineeringProjectDocumentAtom, project);
    store.set(engineeringScenarioDocumentAtom, scenario);

    await store.set(requestEngineeringCalculationAtom, {
      requestedAt: 1_700_000_000_200,
    });
    store.set(applyEngineeringScenarioMutationAtom, {
      updater: (current) => ({
        ...current,
        manualInputs: {
          ...current.manualInputs,
          "var:ambient": createValueSnapshot({
            variableId: "var:ambient",
            value: 33,
            source: "frontend_manual_input",
            status: "ok",
          }),
        },
      }),
    });
    await store.set(requestEngineeringCalculationAtom, {
      requestedAt: 1_700_000_000_220,
    });

    expect(fetchMock).toHaveBeenCalledTimes(4);
    expect(fetchMock.mock.calls[2]?.[0]).toBe(
      "http://127.0.0.1:18080/api/v1/sessions/session:api-2/scenario",
    );
    const secondRunPayload = JSON.parse(
      String(fetchMock.mock.calls[3]?.[1]?.body || "{}"),
    );
    expect(secondRunPayload).toMatchObject({
      sessionId: "session:api-2",
      scenarioVersion: 2,
      triggerMode: "manual",
    });
  });

  it("refreshes live snapshots via backend endpoints and periodic tick uses periodic trigger mode", async () => {
    const store = createStore();
    const project = createProjectFixture();
    const scenario = createScenarioFixture(project.id);
    const fetchMock = vi.fn();

    (globalThis as GlobalWithEngineeringBackend).__EXCALIDRAW_ENGINEERING_BACKEND_BASE_URL__ =
      "http://127.0.0.1:18080";
    fetchMock.mockResolvedValueOnce(
      await mockJsonResponse({
        sessionId: "session:api-3",
        acceptedModelVersion: project.revisions.modelVersion,
        acceptedScenarioVersion: scenario.revisions.scenarioVersion,
      }),
    );
    fetchMock.mockResolvedValueOnce(
      await mockJsonResponse({
        sessionId: "session:api-3",
        scenarioVersion: 1,
        refreshedAt: 1_700_000_000_300,
        updatedVariableIds: ["var:ambient"],
      }),
    );
    fetchMock.mockResolvedValueOnce(
      await mockJsonResponse({
        sessionId: "session:api-3",
        scenarioVersion: 1,
        generatedAt: 1_700_000_000_301,
        rows: [
          {
            id: "var:ambient",
            value: 18.6,
            source: "backend_db_pull",
            status: "ok",
            provider_id: "provider:ambient:sensor",
            timestamp: 1_700_000_000_301,
          },
          {
            id: "var:load",
            value: 9.8,
            source: "frontend_manual_input",
            status: "ok",
            timestamp: 1_700_000_000_301,
          },
        ],
      }),
    );
    fetchMock.mockResolvedValueOnce(
      await mockJsonResponse({
        runId: "run:api-3-periodic",
        scenarioVersion: 1,
        status: "success",
        startedAt: 1_700_000_000_302,
        finishedAt: 1_700_000_000_310,
        resultValues: {},
        diagnostics: [],
      }),
    );
    vi.stubGlobal("fetch", fetchMock);

    store.set(engineeringProjectDocumentAtom, project);
    store.set(engineeringScenarioDocumentAtom, scenario);
    store.set(upsertEngineeringPointBindingAtom, {
      variableId: "var:ambient",
      measurement: "ambient.temperature",
      pointName: "sensor.ambient.t",
      field: "value",
    });

    await store.set(refreshEngineeringLiveSnapshotsAtom);
    const snapshot = store.get(engineeringLiveSnapshotsAtom)["var:ambient"];
    expect(snapshot).toMatchObject({
      variableId: "var:ambient",
      value: 18.6,
      source: "backend_db_pull",
      status: "ok",
      providerId: "provider:ambient:sensor",
    });
    expect(store.get(engineeringLiveSnapshotsAtom)["var:load"]).toBeUndefined();

    await store.set(runEngineeringPeriodicCalculationTickAtom);
    const periodicRunCall = fetchMock.mock.calls.find(
      (call) => call[0] === "http://127.0.0.1:18080/api/v1/runs",
    );
    const periodicRunPayload = JSON.parse(
      String(periodicRunCall?.[1]?.body || "{}"),
    );
    expect(periodicRunPayload).toMatchObject({
      sessionId: "session:api-3",
      scenarioVersion: store.get(engineeringScenarioDocumentAtom).revisions
        .scenarioVersion,
      triggerMode: "periodic",
    });
  });
});
