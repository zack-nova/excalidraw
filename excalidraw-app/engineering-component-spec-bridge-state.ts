import { atom } from "./app-jotai";
import { componentSpecCatalogAtom } from "./component-spec-store";
import {
  applyEngineeringProjectMutationAtom,
  engineeringProjectDocumentAtom,
} from "./engineering-domain-state";
import { buildVariableCatalogFromLoadedComponentSpecs } from "./engineering-component-spec-bridge";
import type { ProjectDocument } from "./engineering-domain";

type EngineeringComponentSpecBridgeMemoState = {
  dependencySignature: string;
  specsByTypeRef: Record<string, unknown>;
};

const engineeringComponentSpecBridgeMemoAtom =
  atom<EngineeringComponentSpecBridgeMemoState | null>(null);

const buildEngineeringComponentSpecBridgeDependencySignature = (
  project: ProjectDocument,
  specsByType: Record<string, unknown>,
) => {
  const componentSignature = Object.values(project.topology.componentsById)
    .sort((left, right) => left.id.localeCompare(right.id))
    .map((component) => {
      const anchorSignature = component.anchorIds.slice().sort().join(",");
      return `${component.id}|${component.templateKey || ""}|${anchorSignature}`;
    })
    .join(";");

  const specTypesSignature = Object.keys(specsByType).sort().join(",");

  return `${project.revisions.modelVersion}|${project.revisions.schemaVersion}|${specTypesSignature}|${componentSignature}`;
};

export const syncEngineeringComponentSpecBridgeAtom = atom(
  null,
  (get, set) => {
    const currentProject = get(engineeringProjectDocumentAtom);
    const specsByType = get(componentSpecCatalogAtom).specsByType;
    const dependencySignature =
      buildEngineeringComponentSpecBridgeDependencySignature(
        currentProject,
        specsByType,
      );
    const memoState = get(engineeringComponentSpecBridgeMemoAtom);

    if (
      memoState &&
      memoState.dependencySignature === dependencySignature &&
      memoState.specsByTypeRef === specsByType
    ) {
      return;
    }

    const nextCatalog = buildVariableCatalogFromLoadedComponentSpecs(
      currentProject,
      specsByType,
    );

    if (
      JSON.stringify(currentProject.variableCatalog) === JSON.stringify(nextCatalog)
    ) {
      set(engineeringComponentSpecBridgeMemoAtom, {
        dependencySignature,
        specsByTypeRef: specsByType,
      });
      return;
    }

    set(applyEngineeringProjectMutationAtom, {
      scope: "schema",
      updater: (project) => ({
        ...project,
        variableCatalog: nextCatalog,
      }),
    });
    set(engineeringComponentSpecBridgeMemoAtom, {
      dependencySignature: buildEngineeringComponentSpecBridgeDependencySignature(
        {
          ...currentProject,
          revisions: {
            ...currentProject.revisions,
            schemaVersion: currentProject.revisions.schemaVersion + 1,
          },
          variableCatalog: nextCatalog,
        },
        specsByType,
      ),
      specsByTypeRef: specsByType,
    });
  },
);
