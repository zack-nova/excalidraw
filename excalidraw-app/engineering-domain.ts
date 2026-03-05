export type EngineeringValue = number | string | boolean | null;

export type EntityKind =
  | "project"
  | "environment"
  | "component"
  | "anchor"
  | "pipe"
  | "virtual";

export interface EntityRef {
  kind: EntityKind;
  id: string;
}

export interface ProjectMeta {
  name: string;
  createdAt: number;
  updatedAt: number;
}

export interface ProjectRevisions {
  modelVersion: number;
  schemaVersion: number;
  displayVersion: number;
}

export interface SceneElementBinding {
  elementId: string;
  target:
    | EntityRef
    | {
        kind: "display";
        id: string;
      };
}

export interface SceneBindingState {
  sceneId: string;
  elementBindings: Record<string, SceneElementBinding>;
}

export interface ProjectEntity {
  id: string;
  name: string;
}

export interface EnvironmentEntity {
  id: string;
  name: string;
}

export interface ComponentEntity {
  id: string;
  templateKey?: string;
  name?: string;
  anchorIds: string[];
  props: Record<string, unknown>;
}

export interface AnchorEntity {
  id: string;
  componentId: string;
  key: string;
  name?: string;
  direction?: "inlet" | "outlet" | "bidirectional";
  medium?: string;
}

export interface PipeEntity {
  id: string;
  fromAnchorId: string;
  toAnchorId: string;
  name?: string;
  medium?: string;
  props: Record<string, unknown>;
}

export interface TopologyState {
  projectNode: ProjectEntity;
  environmentNode: EnvironmentEntity;
  componentsById: Record<string, ComponentEntity>;
  anchorsById: Record<string, AnchorEntity>;
  pipesById: Record<string, PipeEntity>;
}

export type VariableValueType = "float" | "string" | "bool" | "enum" | "curve";
export type VariableRole =
  | "measurement"
  | "input"
  | "result"
  | "intermediate"
  | "ingredient";
export type VariableStage =
  | "raw"
  | "preprocess"
  | "backend"
  | "postprocess";

export interface VariableDef {
  id: string;
  owner: EntityRef;
  key: string;
  name: string;
  nameCn?: string;
  valueType: VariableValueType;
  role: VariableRole;
  stage: VariableStage;
  canonicalUnit?: string;
  displayUnit?: string;
  required?: boolean;
  min?: number;
  max?: number;
  enumOptions?: string[];
  tags?: Record<string, string>;
  tips?: string;
  backend?: {
    tpisKey?: string;
    extraInfo?: string;
    operationModes?: string[];
  };
}

interface ProviderBase {
  id: string;
  variableId: string;
  disabled?: boolean;
}

export interface SensorProvider extends ProviderBase {
  kind: "sensor";
  measurement: string;
  pointName: string;
  field: string;
}

export interface ManualProvider extends ProviderBase {
  kind: "manual";
  defaultValue?: EngineeringValue;
}

export interface ExpressionProvider extends ProviderBase {
  kind: "expression";
  stage: "preprocess" | "postprocess";
  expression: string;
  dependencyVariableIds: string[];
}

export interface BackendProvider extends ProviderBase {
  kind: "backend";
}

export type ValueProvider =
  | SensorProvider
  | ManualProvider
  | ExpressionProvider
  | BackendProvider;

export interface VariableCatalogState {
  variablesById: Record<string, VariableDef>;
  providersById: Record<string, ValueProvider>;
  providerIdsByVariableId: Record<string, string[]>;
}

export interface DisplayBinding {
  id: string;
  owner: EntityRef;
  template: string;
  referencedVariableIds: string[];
}

export interface DisplayCatalogState {
  bindingsById: Record<string, DisplayBinding>;
}

export interface ProjectDocument {
  id: string;
  meta: ProjectMeta;
  revisions: ProjectRevisions;
  scene: SceneBindingState;
  topology: TopologyState;
  variableCatalog: VariableCatalogState;
  displayCatalog: DisplayCatalogState;
}

export interface SourcePolicyOverride {
  forcedProviderId?: string;
  preferredProviderKinds?: ValueProvider["kind"][];
  disabledProviderIds?: string[];
}

export interface ScenarioPointBinding {
  variableId: string;
  measurement: string;
  pointName: string;
  field: string;
  providerId?: string;
  updatedAt?: number;
}

export interface ScenarioIndicatorFormula {
  id: string;
  name?: string;
  expression: string;
  outputVariableId: string;
  scope?: "display" | "calculation" | "both";
  enabled: boolean;
  updatedAt?: number;
}

export interface ScenarioRevisions {
  scenarioVersion: number;
}

export interface ScenarioDocument {
  id: string;
  projectId: string;
  name: string;
  type: "live" | "snapshot" | "historical";
  revisions: ScenarioRevisions;
  manualInputs: Record<string, ValueSnapshot>;
  environmentInputs: Record<string, ValueSnapshot>;
  pointBindings: Record<string, ScenarioPointBinding>;
  indicatorFormulas: Record<string, ScenarioIndicatorFormula>;
  sourcePolicyOverrides: Record<string, SourcePolicyOverride>;
  updatedAt: number;
  timeContext?: {
    at?: number;
    from?: number;
    to?: number;
  };
}

export type ValueSnapshotSource =
  | "frontend_manual_input"
  | "frontend_computed"
  | "backend_calculation"
  | "backend_db_pull";

export type ValueSnapshotStatus =
  | "ok"
  | "missing"
  | "stale"
  | "error"
  | "cyclic";

export interface ValueSnapshot {
  variableId: string;
  value: EngineeringValue;
  source: ValueSnapshotSource;
  status: ValueSnapshotStatus;
  timestamp?: number;
  runId?: string;
  providerId?: string;
  detail?: string;
}

export interface CalculationRun {
  id: string;
  projectId: string;
  scenarioId: string;
  basedOn: {
    modelVersion: number;
    scenarioVersion: number;
  };
  status: "queued" | "running" | "success" | "failed" | "partial";
  startedAt?: number;
  finishedAt?: number;
  resultValues: Record<string, ValueSnapshot>;
  diagnostics: DiagnosticIssue[];
}

export interface DiagnosticIssue {
  level: "info" | "warning" | "error";
  code:
    | "run_stale"
    | "missing_value"
    | "expression_cycle"
    | "expression_error";
  message: string;
  variableId?: string;
  providerId?: string;
  entity?: EntityRef;
}

export interface CompiledExpression {
  providerId: string;
  variableId: string;
  expression: string;
  dependencyVariableIds: string[];
  status: "ready" | "cyclic" | "error";
}

export interface EffectiveValueSnapshot extends ValueSnapshot {
  providerKind?: ValueProvider["kind"];
}

export interface RuntimeProjection {
  projectId: string;
  scenarioId: string;
  activeRun:
    | {
        runId: string;
        status: CalculationRun["status"];
        isStale: boolean;
      }
    | null;
  liveSnapshots: Record<string, ValueSnapshot>;
  effectiveValues: Record<string, EffectiveValueSnapshot>;
  compiledExpressions: Record<string, CompiledExpression>;
  diagnostics: DiagnosticIssue[];
}

export interface CalculationRequestManualInput {
  variableId: string;
  providerId?: string;
  value: EngineeringValue;
  valueType: VariableValueType;
}

export interface CalculationRequestPayload {
  requestId: string;
  requestedAt: number;
  projectId: string;
  scenarioId: string;
  basedOn: {
    modelVersion: number;
    schemaVersion: number;
    scenarioVersion: number;
  };
  scene: SceneBindingState;
  topology: TopologyState;
  manualInputs: CalculationRequestManualInput[];
  sourcePolicyOverrides: ScenarioDocument["sourcePolicyOverrides"];
}

type CreateProjectDocumentInput = {
  id?: string;
  meta?: Partial<ProjectMeta>;
  revisions?: Partial<ProjectRevisions>;
};

type CreateScenarioDocumentInput = {
  id?: string;
  name?: string;
  type?: ScenarioDocument["type"];
  revisions?: Partial<ScenarioRevisions>;
  manualInputs?: Record<string, ValueSnapshot>;
  environmentInputs?: Record<string, ValueSnapshot>;
  pointBindings?: Record<string, ScenarioPointBinding>;
  indicatorFormulas?: Record<string, ScenarioIndicatorFormula>;
  sourcePolicyOverrides?: Record<string, SourcePolicyOverride>;
  updatedAt?: number;
  timeContext?: ScenarioDocument["timeContext"];
};

type CreateCalculationRunInput = Omit<CalculationRun, "startedAt" | "finishedAt"> &
  Partial<Pick<CalculationRun, "startedAt" | "finishedAt">>;

type BuildRuntimeProjectionInput = {
  project: ProjectDocument;
  scenario: ScenarioDocument;
  calculationRun?: CalculationRun | null;
  liveSnapshots?: Record<string, ValueSnapshot>;
};

type BuildCalculationRequestPayloadInput = {
  project: ProjectDocument;
  scenario: ScenarioDocument;
  requestedAt?: number;
};

const INPUT_PROVIDER_PRIORITY: Record<ValueProvider["kind"], number> = {
  manual: 0,
  sensor: 1,
  expression: 2,
  backend: 3,
};

const RESULT_PROVIDER_PRIORITY: Record<ValueProvider["kind"], number> = {
  backend: 0,
  expression: 1,
  manual: 2,
  sensor: 3,
};

const POSTPROCESS_PROVIDER_PRIORITY: Record<ValueProvider["kind"], number> = {
  expression: 0,
  backend: 1,
  manual: 2,
  sensor: 3,
};

const DEFAULT_PROJECT_ID = "project:default";
const DEFAULT_ENVIRONMENT_ID = "environment:default";
const SAFE_EXPRESSION_PATTERN = /^[\d\s+\-*/%.(),"'A-Za-z:_]+$/;

let nextDomainId = 1;

const createDomainId = (prefix: string) => {
  const id = `${prefix}:${nextDomainId}`;
  nextDomainId += 1;
  return id;
};

const now = () => Date.now();

const cloneProjectWithRevisions = (
  project: ProjectDocument,
  revisions: ProjectRevisions,
): ProjectDocument => ({
  ...project,
  meta: {
    ...project.meta,
    updatedAt: now(),
  },
  revisions,
});

const selectProviderPriority = (
  variable: VariableDef,
): Record<ValueProvider["kind"], number> => {
  if (variable.stage === "postprocess") {
    return POSTPROCESS_PROVIDER_PRIORITY;
  }
  if (variable.role === "result" || variable.stage === "backend") {
    return RESULT_PROVIDER_PRIORITY;
  }
  return INPUT_PROVIDER_PRIORITY;
};

const pickPreferredSnapshot = (
  current: EffectiveValueSnapshot,
  next: EffectiveValueSnapshot,
) => {
  const rank: Record<ValueSnapshotStatus, number> = {
    ok: 4,
    stale: 3,
    cyclic: 2,
    error: 1,
    missing: 0,
  };

  return rank[next.status] > rank[current.status] ? next : current;
};

const normalizeSnapshot = (
  snapshot: ValueSnapshot,
  overrides: Partial<EffectiveValueSnapshot> = {},
): EffectiveValueSnapshot => ({
  ...snapshot,
  ...overrides,
});

const createMissingSnapshot = (
  variableId: string,
  provider: ValueProvider | undefined,
  source: ValueSnapshotSource,
  status: ValueSnapshotStatus = "missing",
  detail?: string,
): EffectiveValueSnapshot => ({
  variableId,
  value: null,
  source,
  status,
  providerId: provider?.id,
  providerKind: provider?.kind,
  detail,
});

const evaluateExpression = (
  expression: string,
  values: Record<string, EngineeringValue>,
): EngineeringValue => {
  if (!SAFE_EXPRESSION_PATTERN.test(expression)) {
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

const resolveScenarioManualSnapshot = (
  scenario: ScenarioDocument,
  variableId: string,
  provider: ManualProvider,
) => {
  const candidates = [
    scenario.manualInputs[variableId],
    scenario.environmentInputs[variableId],
  ].filter(Boolean) as ValueSnapshot[];

  const matchingSnapshot = candidates.find(
    (snapshot) => !snapshot.providerId || snapshot.providerId === provider.id,
  );

  if (matchingSnapshot) {
    return normalizeSnapshot(matchingSnapshot, {
      providerId: provider.id,
      providerKind: provider.kind,
    });
  }

  if (typeof provider.defaultValue !== "undefined") {
    return createValueSnapshot({
      variableId,
      value: provider.defaultValue,
      source: "frontend_manual_input",
      status: "ok",
      providerId: provider.id,
    });
  }

  return createMissingSnapshot(
    variableId,
    provider,
    "frontend_manual_input",
    "missing",
  );
};

const resolveLiveSnapshot = (
  liveSnapshots: Record<string, ValueSnapshot>,
  variableId: string,
  provider: SensorProvider,
) => {
  const snapshot = liveSnapshots[variableId];

  if (
    snapshot &&
    (!snapshot.providerId || snapshot.providerId === provider.id)
  ) {
    return normalizeSnapshot(snapshot, {
      providerId: provider.id,
      providerKind: provider.kind,
    });
  }

  return createMissingSnapshot(variableId, provider, "backend_db_pull");
};

const resolveBackendSnapshot = (
  run: CalculationRun | null | undefined,
  runIsStale: boolean,
  variableId: string,
  provider: BackendProvider,
  diagnostics: DiagnosticIssue[],
  variable: VariableDef,
) => {
  if (!run) {
    return createMissingSnapshot(variableId, provider, "backend_calculation");
  }

  const snapshot = run.resultValues[variableId];

  if (!snapshot) {
    return createMissingSnapshot(variableId, provider, "backend_calculation");
  }

  if (runIsStale) {
    diagnostics.push({
      level: "warning",
      code: "run_stale",
      message: `Calculation run ${run.id} is stale for variable ${variableId}`,
      variableId,
      providerId: provider.id,
      entity: variable.owner,
    });
  }

  return normalizeSnapshot(snapshot, {
    providerId: provider.id,
    providerKind: provider.kind,
    runId: run.id,
    status:
      runIsStale && snapshot.status === "ok" ? "stale" : snapshot.status,
  });
};

export const createProjectDocument = (
  input: CreateProjectDocumentInput = {},
): ProjectDocument => {
  const createdAt = input.meta?.createdAt ?? now();
  const id = input.id ?? DEFAULT_PROJECT_ID;

  return {
    id,
    meta: {
      name: input.meta?.name ?? "Untitled project",
      createdAt,
      updatedAt: input.meta?.updatedAt ?? createdAt,
    },
    revisions: {
      modelVersion: input.revisions?.modelVersion ?? 1,
      schemaVersion: input.revisions?.schemaVersion ?? 1,
      displayVersion: input.revisions?.displayVersion ?? 1,
    },
    scene: {
      sceneId: `scene:${id}`,
      elementBindings: {},
    },
    topology: {
      projectNode: {
        id,
        name: input.meta?.name ?? "Untitled project",
      },
      environmentNode: {
        id: DEFAULT_ENVIRONMENT_ID,
        name: "Environment",
      },
      componentsById: {},
      anchorsById: {},
      pipesById: {},
    },
    variableCatalog: {
      variablesById: {},
      providersById: {},
      providerIdsByVariableId: {},
    },
    displayCatalog: {
      bindingsById: {},
    },
  };
};

export const createScenarioDocument = (
  projectId: string,
  input: CreateScenarioDocumentInput = {},
): ScenarioDocument => ({
  id: input.id ?? createDomainId("scenario"),
  projectId,
  name: input.name ?? "Default scenario",
  type: input.type ?? "snapshot",
  revisions: {
    scenarioVersion: input.revisions?.scenarioVersion ?? 1,
  },
  manualInputs: input.manualInputs ?? {},
  environmentInputs: input.environmentInputs ?? {},
  pointBindings: input.pointBindings ?? {},
  indicatorFormulas: input.indicatorFormulas ?? {},
  sourcePolicyOverrides: input.sourcePolicyOverrides ?? {},
  updatedAt: input.updatedAt ?? now(),
  timeContext: input.timeContext,
});

export const createCalculationRun = (
  input: CreateCalculationRunInput,
): CalculationRun => ({
  ...input,
  startedAt: input.startedAt ?? now(),
  finishedAt: input.finishedAt ?? now(),
});

export const createValueSnapshot = (
  input: Omit<ValueSnapshot, "timestamp"> & { timestamp?: number },
): ValueSnapshot => ({
  ...input,
  timestamp: input.timestamp ?? now(),
});

export const bumpProjectModelVersion = (
  project: ProjectDocument,
): ProjectDocument =>
  cloneProjectWithRevisions(project, {
    ...project.revisions,
    modelVersion: project.revisions.modelVersion + 1,
  });

export const bumpProjectDisplayVersion = (
  project: ProjectDocument,
): ProjectDocument =>
  cloneProjectWithRevisions(project, {
    ...project.revisions,
    displayVersion: project.revisions.displayVersion + 1,
  });

export const bumpProjectSchemaVersion = (
  project: ProjectDocument,
): ProjectDocument =>
  cloneProjectWithRevisions(project, {
    ...project.revisions,
    schemaVersion: project.revisions.schemaVersion + 1,
  });

export const bumpScenarioVersion = (
  scenario: ScenarioDocument,
): ScenarioDocument => ({
  ...scenario,
  revisions: {
    scenarioVersion: scenario.revisions.scenarioVersion + 1,
  },
  updatedAt: now(),
});

export const isCalculationRunStale = (
  run: CalculationRun,
  project: ProjectDocument,
  scenario: ScenarioDocument,
) =>
  run.projectId !== project.id ||
  run.scenarioId !== scenario.id ||
  run.basedOn.modelVersion !== project.revisions.modelVersion ||
  run.basedOn.scenarioVersion !== scenario.revisions.scenarioVersion;

export const buildRuntimeProjection = ({
  project,
  scenario,
  calculationRun,
  liveSnapshots = {},
}: BuildRuntimeProjectionInput): RuntimeProjection => {
  const diagnostics: DiagnosticIssue[] = [];
  const compiledExpressions: Record<string, CompiledExpression> = {};
  const effectiveValues: Record<string, EffectiveValueSnapshot> = {};
  const resolutionCache = new Map<string, EffectiveValueSnapshot>();
  const resolvingVariables = new Set<string>();
  const runIsStale = calculationRun
    ? isCalculationRunStale(calculationRun, project, scenario)
    : false;

  const getProviderIdsForVariable = (variableId: string) => {
    const explicitProviderIds =
      project.variableCatalog.providerIdsByVariableId[variableId] ?? [];
    const fallbackProviderIds = Object.values(project.variableCatalog.providersById)
      .filter((provider) => provider.variableId === variableId)
      .map((provider) => provider.id);

    return explicitProviderIds.length > 0 ? explicitProviderIds : fallbackProviderIds;
  };

  const getOrderedProviders = (variable: VariableDef) => {
    const providerIds = getProviderIdsForVariable(variable.id);
    const override = scenario.sourcePolicyOverrides[variable.id];
    const priority = selectProviderPriority(variable);

    return providerIds
      .map((providerId) => project.variableCatalog.providersById[providerId])
      .filter((provider): provider is ValueProvider => !!provider)
      .filter((provider) => !provider.disabled)
      .filter(
        (provider) => !override?.disabledProviderIds?.includes(provider.id),
      )
      .sort((left, right) => {
        if (override?.forcedProviderId === left.id) {
          return -1;
        }
        if (override?.forcedProviderId === right.id) {
          return 1;
        }

        const preferredKinds = override?.preferredProviderKinds;
        if (preferredKinds?.length) {
          const leftPreferredIndex = preferredKinds.indexOf(left.kind);
          const rightPreferredIndex = preferredKinds.indexOf(right.kind);

          if (leftPreferredIndex !== rightPreferredIndex) {
            return (
              (leftPreferredIndex === -1 ? Number.MAX_SAFE_INTEGER : leftPreferredIndex) -
              (rightPreferredIndex === -1
                ? Number.MAX_SAFE_INTEGER
                : rightPreferredIndex)
            );
          }
        }

        return priority[left.kind] - priority[right.kind];
      });
  };

  const resolveVariable = (variableId: string): EffectiveValueSnapshot => {
    const cached = resolutionCache.get(variableId);
    if (cached) {
      return cached;
    }

    const variable = project.variableCatalog.variablesById[variableId];
    if (!variable) {
      const missingSnapshot = createMissingSnapshot(
        variableId,
        undefined,
        "frontend_computed",
      );
      resolutionCache.set(variableId, missingSnapshot);
      return missingSnapshot;
    }

    let resolvedSnapshot = createMissingSnapshot(
      variableId,
      undefined,
      variable.stage === "backend" ? "backend_calculation" : "frontend_computed",
    );

    for (const provider of getOrderedProviders(variable)) {
      let candidate: EffectiveValueSnapshot;

      if (provider.kind === "manual") {
        candidate = resolveScenarioManualSnapshot(scenario, variableId, provider);
      } else if (provider.kind === "sensor") {
        candidate = resolveLiveSnapshot(liveSnapshots, variableId, provider);
      } else if (provider.kind === "backend") {
        candidate = resolveBackendSnapshot(
          calculationRun,
          runIsStale,
          variableId,
          provider,
          diagnostics,
          variable,
        );
      } else {
        compiledExpressions[provider.id] = {
          providerId: provider.id,
          variableId,
          expression: provider.expression,
          dependencyVariableIds: provider.dependencyVariableIds.slice(),
          status: "ready",
        };

        if (resolvingVariables.has(variableId)) {
          compiledExpressions[provider.id].status = "cyclic";
          diagnostics.push({
            level: "error",
            code: "expression_cycle",
            message: `Expression cycle detected for variable ${variableId}`,
            variableId,
            providerId: provider.id,
            entity: variable.owner,
          });
          candidate = createMissingSnapshot(
            variableId,
            provider,
            "frontend_computed",
            "cyclic",
          );
        } else {
          resolvingVariables.add(variableId);

          const dependencyValues: Record<string, EngineeringValue> = {};
          const dependencySnapshots = provider.dependencyVariableIds.map(
            (dependencyVariableId) => {
              const snapshot = resolveVariable(dependencyVariableId);
              dependencyValues[dependencyVariableId] = snapshot.value;
              return snapshot;
            },
          );

          if (dependencySnapshots.some((snapshot) => snapshot.status === "cyclic")) {
            compiledExpressions[provider.id].status = "cyclic";
            diagnostics.push({
              level: "error",
              code: "expression_cycle",
              message: `Expression cycle detected for variable ${variableId}`,
              variableId,
              providerId: provider.id,
              entity: variable.owner,
            });
            candidate = createMissingSnapshot(
              variableId,
              provider,
              "frontend_computed",
              "cyclic",
            );
          } else if (
            dependencySnapshots.some(
              (snapshot) => snapshot.status !== "ok" && snapshot.status !== "stale",
            )
          ) {
            candidate = createMissingSnapshot(
              variableId,
              provider,
              "frontend_computed",
              "missing",
            );
          } else {
            try {
              const expressionValue = evaluateExpression(
                provider.expression,
                dependencyValues,
              );
              const hasStaleDependency = dependencySnapshots.some(
                (snapshot) => snapshot.status === "stale",
              );

              candidate = createValueSnapshot({
                variableId,
                value: expressionValue,
                source: "frontend_computed",
                status: hasStaleDependency ? "stale" : "ok",
                providerId: provider.id,
              });
              candidate = normalizeSnapshot(candidate, {
                providerKind: provider.kind,
              });
            } catch (error) {
              compiledExpressions[provider.id].status = "error";
              diagnostics.push({
                level: "error",
                code: "expression_error",
                message:
                  error instanceof Error
                    ? error.message
                    : `Failed to evaluate expression for ${variableId}`,
                variableId,
                providerId: provider.id,
                entity: variable.owner,
              });
              candidate = createMissingSnapshot(
                variableId,
                provider,
                "frontend_computed",
                "error",
                error instanceof Error ? error.message : undefined,
              );
            }
          }

          resolvingVariables.delete(variableId);
        }
      }

      if (candidate.status === "ok" || candidate.status === "stale") {
        resolutionCache.set(variableId, candidate);
        return candidate;
      }

      resolvedSnapshot = pickPreferredSnapshot(resolvedSnapshot, candidate);
    }

    if (resolvedSnapshot.status === "missing") {
      diagnostics.push({
        level: "warning",
        code: "missing_value",
        message: `No resolved value found for variable ${variableId}`,
        variableId,
        entity: variable.owner,
      });
    }

    resolutionCache.set(variableId, resolvedSnapshot);
    return resolvedSnapshot;
  };

  for (const variableId of Object.keys(project.variableCatalog.variablesById)) {
    effectiveValues[variableId] = resolveVariable(variableId);
  }

  return {
    projectId: project.id,
    scenarioId: scenario.id,
    activeRun: calculationRun
      ? {
          runId: calculationRun.id,
          status: calculationRun.status,
          isStale: runIsStale,
        }
      : null,
    liveSnapshots,
    effectiveValues,
    compiledExpressions,
    diagnostics,
  };
};

const resolveManualProviderIdForVariable = (
  project: ProjectDocument,
  variableId: string,
) => {
  const explicitProviderIds =
    project.variableCatalog.providerIdsByVariableId[variableId] ?? [];
  const fallbackProviderIds = Object.values(project.variableCatalog.providersById)
    .filter((provider) => provider.variableId === variableId)
    .map((provider) => provider.id);
  const providerIds =
    explicitProviderIds.length > 0 ? explicitProviderIds : fallbackProviderIds;

  return providerIds.find((providerId) => {
    const provider = project.variableCatalog.providersById[providerId];
    return provider?.kind === "manual";
  });
};

export const buildCalculationRequestPayload = ({
  project,
  scenario,
  requestedAt = now(),
}: BuildCalculationRequestPayloadInput): CalculationRequestPayload => {
  const manualInputs: CalculationRequestManualInput[] = Object.entries(
    scenario.manualInputs,
  )
    .sort(([leftVariableId], [rightVariableId]) =>
      leftVariableId.localeCompare(rightVariableId),
    )
    .flatMap(([variableId, snapshot]) => {
      const variable = project.variableCatalog.variablesById[variableId];

      if (!variable) {
        return [];
      }

      if (snapshot.source !== "frontend_manual_input") {
        return [];
      }

      return [
        {
          variableId,
          providerId:
            snapshot.providerId || resolveManualProviderIdForVariable(project, variableId),
          value: snapshot.value,
          valueType: variable.valueType,
        },
      ];
    });

  return {
    requestId: `calculation-request:${project.id}:${scenario.id}:${requestedAt}`,
    requestedAt,
    projectId: project.id,
    scenarioId: scenario.id,
    basedOn: {
      modelVersion: project.revisions.modelVersion,
      schemaVersion: project.revisions.schemaVersion,
      scenarioVersion: scenario.revisions.scenarioVersion,
    },
    scene: project.scene,
    topology: project.topology,
    manualInputs,
    sourcePolicyOverrides: scenario.sourcePolicyOverrides,
  };
};
