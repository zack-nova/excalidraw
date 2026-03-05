import { atom } from "./app-jotai";
import { componentSpecCatalogAtom } from "./component-spec-store";
import {
  applyEngineeringProjectMutationAtom,
  engineeringProjectDocumentAtom,
} from "./engineering-domain-state";
import { buildVariableCatalogFromLoadedComponentSpecs } from "./engineering-component-spec-bridge";

export const syncEngineeringComponentSpecBridgeAtom = atom(
  null,
  (get, set) => {
    const currentProject = get(engineeringProjectDocumentAtom);
    const specsByType = get(componentSpecCatalogAtom).specsByType;
    const nextCatalog = buildVariableCatalogFromLoadedComponentSpecs(
      currentProject,
      specsByType,
    );

    if (
      JSON.stringify(currentProject.variableCatalog) === JSON.stringify(nextCatalog)
    ) {
      return;
    }

    set(applyEngineeringProjectMutationAtom, {
      scope: "schema",
      updater: (project) => ({
        ...project,
        variableCatalog: buildVariableCatalogFromLoadedComponentSpecs(
          project,
          specsByType,
        ),
      }),
    });
  },
);
