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
  type EngineeringValue,
  isCalculationRunStale,
  type CalculationRun,
  type ProjectDocument,
  type RuntimeProjection,
  type ScenarioDocument,
  type ValueSnapshot,
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

const toRunRuntimeStatus = (status: CalculationRun["status"]): EngineeringRunRuntimeStatus =>
  status;
const now = () => Date.now();
let nextMockRunId = 1;

const SAFE_FORMULA_PATTERN = /^[\d\s+\-*/%.(),"'A-Za-z:_]+$/;
const FORMULA_REF_PATTERN = /ref\(\s*["']([^"']+)["']\s*\)/g;

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
  (get, set) => {
    const project = get(engineeringProjectDocumentAtom);
    const scenario = get(engineeringScenarioDocumentAtom);
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
    },
  ) => {
    const scenario = get(engineeringScenarioDocumentAtom);
    const liveSnapshots = get(engineeringLiveSnapshotsAtom);
    const indicatorFormulaSnapshots = get(engineeringIndicatorFormulaSnapshotsAtom);
    const requestPayload = buildCalculationRequestPayload({
      project: get(engineeringProjectDocumentAtom),
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
  },
);

export const runEngineeringPeriodicCalculationTickAtom = atom(
  null,
  async (_get, set) => {
    await set(requestEngineeringCalculationAtom, {
      requestedAt: now(),
    });
  },
);
