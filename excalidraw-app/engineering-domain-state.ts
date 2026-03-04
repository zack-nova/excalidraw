import { atom } from "./app-jotai";
import {
  buildRuntimeProjection,
  bumpProjectDisplayVersion,
  bumpProjectModelVersion,
  bumpProjectSchemaVersion,
  bumpScenarioVersion,
  createProjectDocument,
  createScenarioDocument,
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
