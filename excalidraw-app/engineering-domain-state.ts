import { atom } from "./app-jotai";
import {
  buildCalculationRequestPayload,
  buildRuntimeProjection,
  bumpProjectDisplayVersion,
  bumpProjectModelVersion,
  bumpProjectSchemaVersion,
  bumpScenarioVersion,
  type CalculationRequestPayload,
  createValueSnapshot,
  createProjectDocument,
  createScenarioDocument,
  type DiagnosticIssue,
  type EngineeringValue,
  isCalculationRunStale,
  type CalculationRun,
  type ProjectDocument,
  type RuntimeProjection,
  type ScenarioDocument,
  type ValueSnapshot,
  type ValueSnapshotStatus,
} from "./engineering-domain";

export type EngineeringProjectMutationScope =
  | "model"
  | "display"
  | "schema"
  | "none";

export const engineeringProjectDocumentAtom = atom<ProjectDocument>(
  createProjectDocument(),
);

export const engineeringScenarioDocumentAtom = atom<ScenarioDocument>(
  createScenarioDocument("project:default"),
);

export const engineeringCalculationRunsAtom = atom<Record<string, CalculationRun>>(
  {},
);

export const engineeringSelectedCalculationRunIdAtom = atom<string | null>(null);

export const engineeringLiveSnapshotsAtom = atom<Record<string, ValueSnapshot>>(
  {},
);

export const engineeringLastCalculationRequestAtom =
  atom<CalculationRequestPayload | null>(null);

export type EngineeringRunRuntimeStatus =
  | "idle"
  | "requesting"
  | CalculationRun["status"];

export type EngineeringRunRuntimeState = {
  activeRunId: string | null;
  status: EngineeringRunRuntimeStatus;
  requestedAt: number | null;
  errorMessage: string | null;
};

const createIdleRunRuntimeState = (): EngineeringRunRuntimeState => ({
  activeRunId: null,
  status: "idle",
  requestedAt: null,
  errorMessage: null,
});

export const engineeringRunRuntimeAtom = atom<EngineeringRunRuntimeState>(
  createIdleRunRuntimeState(),
);

export type EngineeringBackendSessionState = {
  baseUrl: string;
  sessionId: string;
  projectId: string;
  scenarioId: string;
  acceptedModelVersion: number;
  acceptedScenarioVersion: number;
};

export const engineeringBackendSessionAtom =
  atom<EngineeringBackendSessionState | null>(null);

const toRunRuntimeStatus = (status: CalculationRun["status"]): EngineeringRunRuntimeStatus =>
  status;
const now = () => Date.now();
let nextMockRunId = 1;

const SAFE_FORMULA_PATTERN = /^[\d\s+\-*/%.(),"'A-Za-z:_]+$/;
const FORMULA_REF_PATTERN = /ref\(\s*["']([^"']+)["']\s*\)/g;
const VALUE_SNAPSHOT_STATUSES: readonly ValueSnapshotStatus[] = [
  "ok",
  "missing",
  "stale",
  "error",
  "cyclic",
];
const VALUE_SNAPSHOT_SOURCES: readonly ValueSnapshot["source"][] = [
  "frontend_manual_input",
  "frontend_computed",
  "backend_calculation",
  "backend_db_pull",
];
const RECOVERABLE_BACKEND_ERROR_CODES = new Set([
  "scenario_version_mismatch",
  "session_not_found",
]);

type EngineeringBackendErrorDetail = {
  code?: string;
  message?: string;
};

type EngineeringBackendLiveRowsResponse = {
  rows?: unknown;
};

type EngineeringBackendRunResponse = {
  runId: string;
  scenarioVersion?: number;
  status?: CalculationRun["status"];
  startedAt?: number;
  finishedAt?: number;
  resultValues?: unknown;
  diagnostics?: unknown;
};

class EngineeringBackendHttpError extends Error {
  status: number;
  detail?: EngineeringBackendErrorDetail;

  constructor(
    message: string,
    status: number,
    detail?: EngineeringBackendErrorDetail,
  ) {
    super(message);
    this.name = "EngineeringBackendHttpError";
    this.status = status;
    this.detail = detail;
  }
}

const getConfiguredEngineeringBackendBaseUrl = () => {
  const runtimeBaseUrl = (
    globalThis as typeof globalThis & {
      __EXCALIDRAW_ENGINEERING_BACKEND_BASE_URL__?: unknown;
    }
  ).__EXCALIDRAW_ENGINEERING_BACKEND_BASE_URL__;
  if (typeof runtimeBaseUrl === "string") {
    const runtimeTrimmed = runtimeBaseUrl.trim();
    if (runtimeTrimmed) {
      return runtimeTrimmed.replace(/\/+$/, "");
    }
  }

  // Avoid real network calls in tests unless explicitly injected at runtime.
  if (import.meta.env.MODE === "test") {
    return null;
  }

  const candidate = import.meta.env.VITE_APP_ENGINEERING_BACKEND_URL;
  if (typeof candidate !== "string") {
    return null;
  }
  const trimmed = candidate.trim();
  if (!trimmed) {
    return null;
  }

  return trimmed.replace(/\/+$/, "");
};

const toValueSnapshotStatus = (
  value: unknown,
  fallback: ValueSnapshotStatus = "missing",
): ValueSnapshotStatus =>
  VALUE_SNAPSHOT_STATUSES.includes(value as ValueSnapshotStatus)
    ? (value as ValueSnapshotStatus)
    : fallback;

const toValueSnapshotSource = (
  value: unknown,
  fallback: ValueSnapshot["source"],
): ValueSnapshot["source"] =>
  VALUE_SNAPSHOT_SOURCES.includes(value as ValueSnapshot["source"])
    ? (value as ValueSnapshot["source"])
    : fallback;

const requestEngineeringBackendJson = async <T>(
  baseUrl: string,
  path: string,
  init?: RequestInit,
): Promise<T> => {
  const response = await fetch(`${baseUrl}${path}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...(init?.headers || {}),
    },
  });
  let responseBody: unknown = null;

  try {
    responseBody = await response.json();
  } catch {
    responseBody = null;
  }

  if (!response.ok) {
    const detail =
      responseBody &&
      typeof responseBody === "object" &&
      "detail" in responseBody &&
      responseBody.detail &&
      typeof responseBody.detail === "object"
        ? (responseBody.detail as EngineeringBackendErrorDetail)
        : undefined;

    throw new EngineeringBackendHttpError(
      detail?.message || `Engineering backend request failed with ${response.status}`,
      response.status,
      detail,
    );
  }

  return (responseBody ?? {}) as T;
};

const isRecoverableEngineeringBackendError = (error: unknown) =>
  error instanceof EngineeringBackendHttpError &&
  !!error.detail?.code &&
  RECOVERABLE_BACKEND_ERROR_CODES.has(error.detail.code);

const toRunDiagnostics = (diagnostics: unknown): DiagnosticIssue[] => {
  if (!Array.isArray(diagnostics)) {
    return [];
  }

  return diagnostics.filter((diagnostic): diagnostic is DiagnosticIssue => {
    if (!diagnostic || typeof diagnostic !== "object") {
      return false;
    }

    const level = (diagnostic as { level?: unknown }).level;
    const message = (diagnostic as { message?: unknown }).message;

    return (
      (level === "info" || level === "warning" || level === "error") &&
      typeof message === "string"
    );
  });
};

const toRunResultValues = (
  resultValues: unknown,
  runId: string,
): CalculationRun["resultValues"] => {
  if (!resultValues || typeof resultValues !== "object") {
    return {};
  }

  const nextResultValues: CalculationRun["resultValues"] = {};

  Object.entries(resultValues as Record<string, unknown>).forEach(
    ([variableId, snapshotValue]) => {
      if (!snapshotValue || typeof snapshotValue !== "object") {
        return;
      }
      const snapshot = snapshotValue as Record<string, unknown>;
      nextResultValues[variableId] = createValueSnapshot({
        variableId,
        value: (snapshot.value as EngineeringValue | undefined) ?? null,
        source: toValueSnapshotSource(
          snapshot.source,
          "backend_calculation",
        ),
        status: toValueSnapshotStatus(snapshot.status, "missing"),
        providerId:
          typeof snapshot.providerId === "string"
            ? snapshot.providerId
            : undefined,
        runId:
          typeof snapshot.runId === "string" && snapshot.runId.length > 0
            ? snapshot.runId
            : runId,
        detail:
          typeof snapshot.detail === "string" ? snapshot.detail : undefined,
        timestamp:
          typeof snapshot.timestamp === "number" ? snapshot.timestamp : undefined,
      });
    },
  );

  return nextResultValues;
};

const toLiveSnapshotsFromRows = (
  rowsResponse: EngineeringBackendLiveRowsResponse,
): Record<string, ValueSnapshot> => {
  if (!Array.isArray(rowsResponse.rows)) {
    return {};
  }

  const snapshots: Record<string, ValueSnapshot> = {};
  rowsResponse.rows.forEach((rowValue) => {
    if (!rowValue || typeof rowValue !== "object") {
      return;
    }
    const row = rowValue as Record<string, unknown>;
    const variableId = row.id;

    if (typeof variableId !== "string" || variableId.length === 0) {
      return;
    }

    if (row.source !== "backend_db_pull") {
      return;
    }

    snapshots[variableId] = createValueSnapshot({
      variableId,
      value: (row.value as EngineeringValue | undefined) ?? null,
      source: "backend_db_pull",
      status: toValueSnapshotStatus(row.status, "missing"),
      providerId:
        typeof row.provider_id === "string" ? row.provider_id : undefined,
      timestamp: typeof row.timestamp === "number" ? row.timestamp : undefined,
    });
  });

  return snapshots;
};

const evaluateExpression = (
  expression: string,
  values: Record<string, EngineeringValue>,
): EngineeringValue => {
  if (!SAFE_FORMULA_PATTERN.test(expression)) {
    throw new Error("Expression contains unsupported characters");
  }

  const fn = new Function(
    "ref",
    `"use strict"; return (${expression});`,
  ) as (resolver: (variableId: string) => EngineeringValue) => EngineeringValue;

  const result = fn((variableId) => {
    if (!(variableId in values)) {
      throw new Error(`Missing dependency: ${variableId}`);
    }

    return values[variableId];
  });

  if (typeof result === "number" && Number.isNaN(result)) {
    throw new Error("Expression returned NaN");
  }

  return result as EngineeringValue;
};

const collectExpressionDependencies = (expression: string) => {
  const variableIds = new Set<string>();
  const matches = expression.matchAll(FORMULA_REF_PATTERN);

  for (const match of matches) {
    if (match[1]) {
      variableIds.add(match[1]);
    }
  }

  return Array.from(variableIds);
};

const findSensorProviderIdForVariable = (
  project: ProjectDocument,
  variableId: string,
) => {
  const providerIds =
    project.variableCatalog.providerIdsByVariableId[variableId] ||
    Object.values(project.variableCatalog.providersById)
      .filter((provider) => provider.variableId === variableId)
      .map((provider) => provider.id);

  return providerIds.find((providerId) => {
    const provider = project.variableCatalog.providersById[providerId];
    return provider?.kind === "sensor";
  });
};

const hashString = (value: string) => {
  let hash = 0;

  for (let index = 0; index < value.length; index += 1) {
    hash = (hash << 5) - hash + value.charCodeAt(index);
    hash |= 0;
  }

  return Math.abs(hash);
};

const toMockLiveValue = (
  variableId: string,
  measurement: string,
  pointName: string,
  field: string,
  previousValue: EngineeringValue | undefined,
) => {
  if (typeof previousValue === "number" && Number.isFinite(previousValue)) {
    return Number((previousValue + 0.1).toFixed(4));
  }

  const seed = hashString(
    `${variableId}|${measurement}|${pointName}|${field}`,
  );

  return Number(((seed % 5000) / 100).toFixed(2));
};

type EngineeringBackendCreateSessionResponse = {
  sessionId: string;
  acceptedModelVersion?: number;
  acceptedScenarioVersion?: number;
};

type EngineeringBackendUpdateScenarioResponse = {
  acceptedScenarioVersion?: number;
};

const createEngineeringBackendSession = async (
  baseUrl: string,
  project: ProjectDocument,
  scenario: ScenarioDocument,
) => {
  const response = await requestEngineeringBackendJson<EngineeringBackendCreateSessionResponse>(
    baseUrl,
    "/api/v1/sessions",
    {
      method: "POST",
      body: JSON.stringify({
        project,
        scenario,
      }),
    },
  );

  if (typeof response.sessionId !== "string" || response.sessionId.length === 0) {
    throw new Error("Engineering backend returned an invalid sessionId");
  }

  return {
    baseUrl,
    sessionId: response.sessionId,
    projectId: project.id,
    scenarioId: scenario.id,
    acceptedModelVersion:
      typeof response.acceptedModelVersion === "number"
        ? response.acceptedModelVersion
        : project.revisions.modelVersion,
    acceptedScenarioVersion:
      typeof response.acceptedScenarioVersion === "number"
        ? response.acceptedScenarioVersion
        : scenario.revisions.scenarioVersion,
  } satisfies EngineeringBackendSessionState;
};

const ensureEngineeringBackendSession = async (payload: {
  baseUrl: string;
  project: ProjectDocument;
  scenario: ScenarioDocument;
  currentSession: EngineeringBackendSessionState | null;
  onSessionChange: (nextSession: EngineeringBackendSessionState | null) => void;
}) => {
  const { baseUrl, project, scenario, currentSession, onSessionChange } = payload;
  const shouldCreateSession =
    !currentSession ||
    currentSession.baseUrl !== baseUrl ||
    currentSession.projectId !== project.id ||
    currentSession.scenarioId !== scenario.id ||
    currentSession.acceptedModelVersion !== project.revisions.modelVersion;

  if (shouldCreateSession) {
    const createdSession = await createEngineeringBackendSession(
      baseUrl,
      project,
      scenario,
    );
    onSessionChange(createdSession);
    return createdSession;
  }

  const nextScenarioVersion = scenario.revisions.scenarioVersion;
  if (currentSession.acceptedScenarioVersion === nextScenarioVersion) {
    return currentSession;
  }

  try {
    const response =
      await requestEngineeringBackendJson<EngineeringBackendUpdateScenarioResponse>(
        baseUrl,
        `/api/v1/sessions/${currentSession.sessionId}/scenario`,
        {
          method: "PUT",
          body: JSON.stringify({
            scenario,
          }),
        },
      );
    const updatedSession: EngineeringBackendSessionState = {
      ...currentSession,
      acceptedScenarioVersion:
        typeof response.acceptedScenarioVersion === "number"
          ? response.acceptedScenarioVersion
          : nextScenarioVersion,
      scenarioId: scenario.id,
    };
    onSessionChange(updatedSession);
    return updatedSession;
  } catch (error) {
    if (!isRecoverableEngineeringBackendError(error)) {
      throw error;
    }

    const createdSession = await createEngineeringBackendSession(
      baseUrl,
      project,
      scenario,
    );
    onSessionChange(createdSession);
    return createdSession;
  }
};

const withEngineeringBackendSessionRetry = async <T>(payload: {
  baseUrl: string;
  project: ProjectDocument;
  scenario: ScenarioDocument;
  currentSession: EngineeringBackendSessionState | null;
  onSessionChange: (nextSession: EngineeringBackendSessionState | null) => void;
  execute: (session: EngineeringBackendSessionState) => Promise<T>;
}) => {
  const { baseUrl, project, scenario, currentSession, onSessionChange, execute } =
    payload;
  let session = await ensureEngineeringBackendSession({
    baseUrl,
    project,
    scenario,
    currentSession,
    onSessionChange,
  });

  try {
    return await execute(session);
  } catch (error) {
    if (!isRecoverableEngineeringBackendError(error)) {
      throw error;
    }

    onSessionChange(null);
    session = await ensureEngineeringBackendSession({
      baseUrl,
      project,
      scenario,
      currentSession: null,
      onSessionChange,
    });
    return execute(session);
  }
};

export const applyEngineeringProjectMutationAtom = atom(
  null,
  (
    get,
    set,
    payload: {
      scope?: EngineeringProjectMutationScope;
      updater: (current: ProjectDocument) => ProjectDocument;
    },
  ) => {
    const current = get(engineeringProjectDocumentAtom);
    const updated = payload.updater(current);

    const next =
      payload.scope === "display"
        ? bumpProjectDisplayVersion(updated)
        : payload.scope === "schema"
        ? bumpProjectSchemaVersion(updated)
        : payload.scope === "none"
        ? updated
        : bumpProjectModelVersion(updated);

    set(engineeringProjectDocumentAtom, next);
  },
);

export const applyEngineeringScenarioMutationAtom = atom(
  null,
  (
    get,
    set,
    payload: {
      bumpVersion?: boolean;
      updater: (current: ScenarioDocument) => ScenarioDocument;
    },
  ) => {
    const current = get(engineeringScenarioDocumentAtom);
    const updated = payload.updater(current);

    set(
      engineeringScenarioDocumentAtom,
      payload.bumpVersion === false ? updated : bumpScenarioVersion(updated),
    );
  },
);

export const upsertEngineeringPointBindingAtom = atom(
  null,
  (
    _get,
    set,
    payload: {
      variableId: string;
      measurement: string;
      pointName: string;
      field: string;
      providerId?: string;
    },
  ) => {
    set(applyEngineeringScenarioMutationAtom, {
      updater: (current) => ({
        ...current,
        pointBindings: {
          ...current.pointBindings,
          [payload.variableId]: {
            variableId: payload.variableId,
            measurement: payload.measurement,
            pointName: payload.pointName,
            field: payload.field,
            providerId: payload.providerId,
            updatedAt: now(),
          },
        },
      }),
    });
  },
);

export const refreshEngineeringLiveSnapshotsAtom = atom(
  null,
  async (get, set) => {
    const project = get(engineeringProjectDocumentAtom);
    const scenario = get(engineeringScenarioDocumentAtom);
    const backendBaseUrl = getConfiguredEngineeringBackendBaseUrl();

    if (!backendBaseUrl) {
      const currentLiveSnapshots = get(engineeringLiveSnapshotsAtom);
      const nextLiveSnapshots = {
        ...currentLiveSnapshots,
      };

      Object.values(scenario.pointBindings).forEach((binding) => {
        const previousSnapshot = currentLiveSnapshots[binding.variableId];
        const providerId =
          binding.providerId ||
          findSensorProviderIdForVariable(project, binding.variableId);

        nextLiveSnapshots[binding.variableId] = createValueSnapshot({
          variableId: binding.variableId,
          value: toMockLiveValue(
            binding.variableId,
            binding.measurement,
            binding.pointName,
            binding.field,
            previousSnapshot?.value,
          ),
          source: "backend_db_pull",
          status: "ok",
          providerId,
        });
      });

      set(engineeringLiveSnapshotsAtom, nextLiveSnapshots);
      return;
    }

    await withEngineeringBackendSessionRetry({
      baseUrl: backendBaseUrl,
      project,
      scenario,
      currentSession: get(engineeringBackendSessionAtom),
      onSessionChange: (nextSession) => {
        set(engineeringBackendSessionAtom, nextSession);
      },
      execute: async (session) => {
        await requestEngineeringBackendJson(
          backendBaseUrl,
          "/api/v1/live/refresh",
          {
            method: "POST",
            body: JSON.stringify({
              sessionId: session.sessionId,
              scenarioVersion: scenario.revisions.scenarioVersion,
            }),
          },
        );

        const query = new URLSearchParams({
          sessionId: session.sessionId,
          scenarioVersion: String(scenario.revisions.scenarioVersion),
        });
        const rowsResponse =
          await requestEngineeringBackendJson<EngineeringBackendLiveRowsResponse>(
            backendBaseUrl,
            `/api/v1/live/rows?${query.toString()}`,
          );
        set(
          engineeringLiveSnapshotsAtom,
          toLiveSnapshotsFromRows(rowsResponse),
        );
      },
    });
  },
);

export const upsertEngineeringIndicatorFormulaAtom = atom(
  null,
  (
    _get,
    set,
    payload: {
      id: string;
      name?: string;
      expression: string;
      outputVariableId: string;
      scope?: "display" | "calculation" | "both";
      enabled?: boolean;
    },
  ) => {
    set(applyEngineeringScenarioMutationAtom, {
      updater: (current) => ({
        ...current,
        indicatorFormulas: {
          ...current.indicatorFormulas,
          [payload.id]: {
            id: payload.id,
            name: payload.name,
            expression: payload.expression,
            outputVariableId: payload.outputVariableId,
            scope: payload.scope,
            enabled: payload.enabled ?? true,
            updatedAt: now(),
          },
        },
      }),
    });
  },
);

export const engineeringIndicatorFormulaSnapshotsAtom = atom<
  Record<string, ValueSnapshot>
>((get) => {
  const scenario = get(engineeringScenarioDocumentAtom);
  const liveSnapshots = get(engineeringLiveSnapshotsAtom);
  const formulaSnapshots: Record<string, ValueSnapshot> = {};
  const valuesByVariableId: Record<string, EngineeringValue> = {};

  Object.entries(liveSnapshots).forEach(([variableId, snapshot]) => {
    if (snapshot.status === "ok" || snapshot.status === "stale") {
      valuesByVariableId[variableId] = snapshot.value;
    }
  });

  Object.entries(scenario.manualInputs).forEach(([variableId, snapshot]) => {
    if (snapshot.status === "ok" || snapshot.status === "stale") {
      valuesByVariableId[variableId] = snapshot.value;
    }
  });

  Object.values(scenario.indicatorFormulas)
    .filter((formula) => formula.enabled !== false)
    .sort((left, right) => left.id.localeCompare(right.id))
    .forEach((formula) => {
      const dependencyVariableIds = collectExpressionDependencies(
        formula.expression,
      );
      const hasMissingDependency = dependencyVariableIds.some(
        (variableId) => !(variableId in valuesByVariableId),
      );

      if (hasMissingDependency) {
        formulaSnapshots[formula.outputVariableId] = createValueSnapshot({
          variableId: formula.outputVariableId,
          value: null,
          source: "frontend_computed",
          status: "missing",
          detail: "Missing dependencies for indicator formula",
        });
        return;
      }

      try {
        const value = evaluateExpression(formula.expression, valuesByVariableId);
        formulaSnapshots[formula.outputVariableId] = createValueSnapshot({
          variableId: formula.outputVariableId,
          value,
          source: "frontend_computed",
          status: "ok",
          providerId: formula.id,
        });
        valuesByVariableId[formula.outputVariableId] = value;
      } catch (error) {
        formulaSnapshots[formula.outputVariableId] = createValueSnapshot({
          variableId: formula.outputVariableId,
          value: null,
          source: "frontend_computed",
          status: "error",
          detail: error instanceof Error ? error.message : "Formula evaluation failed",
          providerId: formula.id,
        });
      }
    });

  return formulaSnapshots;
});

export const upsertEngineeringCalculationRunAtom = atom(
  null,
  (get, set, run: CalculationRun) => {
    set(engineeringCalculationRunsAtom, {
      ...get(engineeringCalculationRunsAtom),
      [run.id]: run,
    });
  },
);

export const engineeringCurrentCalculationRunAtom = atom((get) => {
  const selectedRunId = get(engineeringSelectedCalculationRunIdAtom);

  if (!selectedRunId) {
    return null;
  }

  const run = get(engineeringCalculationRunsAtom)[selectedRunId];

  if (!run) {
    return null;
  }

  return {
    run,
    isStale: isCalculationRunStale(
      run,
      get(engineeringProjectDocumentAtom),
      get(engineeringScenarioDocumentAtom),
    ),
  };
});

export const engineeringRuntimeProjectionAtom = atom<RuntimeProjection>((get) =>
  buildRuntimeProjection({
    project: get(engineeringProjectDocumentAtom),
    scenario: get(engineeringScenarioDocumentAtom),
    calculationRun: get(engineeringCurrentCalculationRunAtom)?.run ?? null,
    liveSnapshots: get(engineeringLiveSnapshotsAtom),
  }),
);

export const requestEngineeringCalculationAtom = atom(
  null,
  async (
    get,
    set,
    payload?: {
      requestedAt?: number;
      triggerMode?: "manual" | "periodic";
    },
  ) => {
    const project = get(engineeringProjectDocumentAtom);
    const scenario = get(engineeringScenarioDocumentAtom);
    const liveSnapshots = get(engineeringLiveSnapshotsAtom);
    const indicatorFormulaSnapshots = get(engineeringIndicatorFormulaSnapshotsAtom);
    const triggerMode = payload?.triggerMode ?? "manual";
    const requestPayload = buildCalculationRequestPayload({
      project,
      scenario,
      requestedAt: payload?.requestedAt,
    });

    set(engineeringLastCalculationRequestAtom, requestPayload);

    set(engineeringRunRuntimeAtom, {
      activeRunId: null,
      status: "requesting",
      requestedAt: requestPayload.requestedAt,
      errorMessage: null,
    });
    try {
      const backendBaseUrl = getConfiguredEngineeringBackendBaseUrl();

      if (backendBaseUrl) {
        const runResponse = await withEngineeringBackendSessionRetry({
          baseUrl: backendBaseUrl,
          project,
          scenario,
          currentSession: get(engineeringBackendSessionAtom),
          onSessionChange: (nextSession) => {
            set(engineeringBackendSessionAtom, nextSession);
          },
          execute: async (session) =>
            requestEngineeringBackendJson<EngineeringBackendRunResponse>(
              backendBaseUrl,
              "/api/v1/runs",
              {
                method: "POST",
                body: JSON.stringify({
                  sessionId: session.sessionId,
                  scenarioVersion: scenario.revisions.scenarioVersion,
                  triggerMode,
                }),
              },
            ),
        });

        const runStatus =
          runResponse.status === "queued" ||
          runResponse.status === "running" ||
          runResponse.status === "success" ||
          runResponse.status === "failed" ||
          runResponse.status === "partial"
            ? runResponse.status
            : "failed";
        const run: CalculationRun = {
          id: runResponse.runId,
          projectId: requestPayload.projectId,
          scenarioId: requestPayload.scenarioId,
          basedOn: {
            modelVersion: requestPayload.basedOn.modelVersion,
            scenarioVersion:
              typeof runResponse.scenarioVersion === "number"
                ? runResponse.scenarioVersion
                : requestPayload.basedOn.scenarioVersion,
          },
          status: runStatus,
          startedAt:
            typeof runResponse.startedAt === "number"
              ? runResponse.startedAt
              : requestPayload.requestedAt,
          finishedAt:
            typeof runResponse.finishedAt === "number"
              ? runResponse.finishedAt
              : now(),
          resultValues: toRunResultValues(runResponse.resultValues, runResponse.runId),
          diagnostics: toRunDiagnostics(runResponse.diagnostics),
        };

        set(upsertEngineeringCalculationRunAtom, run);
        set(engineeringSelectedCalculationRunIdAtom, run.id);
        set(engineeringRunRuntimeAtom, (current) => ({
          ...current,
          activeRunId: run.id,
          status: toRunRuntimeStatus(run.status),
          errorMessage: null,
        }));
        return;
      }

      const runId = `run:mock:${nextMockRunId++}`;
      const resultValues: CalculationRun["resultValues"] = {};
      const appendResultSnapshots = (snapshots: Record<string, ValueSnapshot>) => {
        Object.entries(snapshots).forEach(([variableId, snapshot]) => {
          resultValues[variableId] = createValueSnapshot({
            ...snapshot,
            variableId,
            runId,
          });
        });
      };

      appendResultSnapshots(liveSnapshots);
      appendResultSnapshots(scenario.manualInputs);
      appendResultSnapshots(indicatorFormulaSnapshots);

      const run: CalculationRun = {
        id: runId,
        projectId: requestPayload.projectId,
        scenarioId: requestPayload.scenarioId,
        basedOn: {
          modelVersion: requestPayload.basedOn.modelVersion,
          scenarioVersion: requestPayload.basedOn.scenarioVersion,
        },
        status: "success",
        startedAt: requestPayload.requestedAt,
        finishedAt: now(),
        resultValues,
        diagnostics: [],
      };

      set(upsertEngineeringCalculationRunAtom, run);
      set(engineeringSelectedCalculationRunIdAtom, run.id);
      set(engineeringRunRuntimeAtom, (current) => ({
        ...current,
        activeRunId: run.id,
        status: toRunRuntimeStatus(run.status),
        errorMessage: null,
      }));
    } catch (error) {
      set(engineeringRunRuntimeAtom, (current) => ({
        ...current,
        status: "idle",
        errorMessage: error instanceof Error ? error.message : "Calculation failed",
      }));
    }
  },
);

export const runEngineeringPeriodicCalculationTickAtom = atom(
  null,
  async (_get, set) => {
    await set(requestEngineeringCalculationAtom, {
      requestedAt: now(),
      triggerMode: "periodic",
    });
  },
);
