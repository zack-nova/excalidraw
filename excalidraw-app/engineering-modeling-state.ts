import { atom } from "./app-jotai";
import { syncEngineeringComponentSpecBridgeAtom } from "./engineering-component-spec-bridge-state";
import {
  applyEngineeringProjectMutationAtom,
  engineeringProjectDocumentAtom,
} from "./engineering-domain-state";
import {
  buildEngineeringModelingProjection,
  isEngineeringModelingProjectionInSync,
  type EngineeringModelingProjection,
} from "./engineering-modeling";

import type { ExcalidrawElement } from "@excalidraw/element/types";

const engineeringModelingSceneElementsAtom = atom<
  readonly ExcalidrawElement[]
>([]);

export const engineeringModelingProjectionAtom = atom<EngineeringModelingProjection>(
  (get) =>
    buildEngineeringModelingProjection(
      get(engineeringProjectDocumentAtom),
      get(engineeringModelingSceneElementsAtom),
    ),
);

export const engineeringStructureTreeAtom = atom(
  (get) => get(engineeringModelingProjectionAtom).structureTree,
);

export const syncEngineeringSceneToModelAtom = atom(
  null,
  (get, set, elements: readonly ExcalidrawElement[]) => {
    set(engineeringModelingSceneElementsAtom, elements);

    const currentProject = get(engineeringProjectDocumentAtom);
    const projection = buildEngineeringModelingProjection(currentProject, elements);

    if (isEngineeringModelingProjectionInSync(currentProject, projection)) {
      set(syncEngineeringComponentSpecBridgeAtom);
      return;
    }

    set(applyEngineeringProjectMutationAtom, {
      scope: "model",
      updater: (project) => ({
        ...project,
        scene: projection.scene,
        topology: projection.topology,
      }),
    });
    set(syncEngineeringComponentSpecBridgeAtom);
  },
);
