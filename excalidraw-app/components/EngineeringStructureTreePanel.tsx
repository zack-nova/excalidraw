import { selectGroupsForSelectedElements } from "@excalidraw/element";
import {
  useApp,
  useExcalidrawAppState,
  useExcalidrawElements,
  useExcalidrawSetAppState,
} from "@excalidraw/excalidraw/components/App";

import { useAtomValue } from "../app-jotai";
import type { ProjectDocument, RuntimeProjection } from "../engineering-domain";
import type { EngineeringStructureTree } from "../engineering-modeling";
import { engineeringStructureTreeAtom } from "../engineering-modeling-state";
import {
  engineeringProjectDocumentAtom,
  engineeringRuntimeProjectionAtom,
} from "../engineering-domain-state";

import "./EngineeringStructureTreePanel.scss";

type StructureTreeItem = EngineeringStructureTree["components"][number];

const normalizeLookupKey = (value: string) => value.trim().toLowerCase();
const COMPONENT_NAME_LOOKUP_KEY = "name";

const buildComponentNameVariableIdByComponentId = (
  structureTree: EngineeringStructureTree,
  project: ProjectDocument,
) => {
  const componentIds = new Set(
    structureTree.components.map((component) => component.entityId),
  );
  const componentNameVariableIdByComponentId: Record<string, string> = {};

  Object.values(project.variableCatalog.variablesById).forEach((variable) => {
    if (variable.owner.kind !== "component") {
      return;
    }
    if (!componentIds.has(variable.owner.id)) {
      return;
    }

    const lookupKey =
      normalizeLookupKey(variable.backend?.tpisKey || "") ===
      COMPONENT_NAME_LOOKUP_KEY
        ? variable.backend?.tpisKey || ""
        : variable.key;

    if (normalizeLookupKey(lookupKey) !== COMPONENT_NAME_LOOKUP_KEY) {
      return;
    }

    if (componentNameVariableIdByComponentId[variable.owner.id]) {
      return;
    }

    componentNameVariableIdByComponentId[variable.owner.id] = variable.id;
  });

  return componentNameVariableIdByComponentId;
};

const toResolvedComponentLabel = ({
  componentId,
  fallbackLabel,
  project,
  runtimeProjection,
  componentNameVariableIdByComponentId,
}: {
  componentId: string;
  fallbackLabel: string;
  project: ProjectDocument;
  runtimeProjection: RuntimeProjection;
  componentNameVariableIdByComponentId: Record<string, string>;
}) => {
  const componentNameVariableId = componentNameVariableIdByComponentId[componentId];

  if (componentNameVariableId) {
    const resolvedValue = runtimeProjection.effectiveValues[componentNameVariableId]?.value;
    if (typeof resolvedValue === "string" && resolvedValue.trim().length > 0) {
      return resolvedValue.trim();
    }
  }

  const topologyName = project.topology.componentsById[componentId]?.name;
  return topologyName || fallbackLabel;
};

const StructureTreeSection = ({
  title,
  items,
  testId,
  onSelect,
  selectedElementIds,
}: {
  title: string;
  items: StructureTreeItem[];
  testId: string;
  onSelect: (item: StructureTreeItem) => void;
  selectedElementIds: Readonly<Record<string, true>>;
}) => (
  <section className="engineering-structure-tree__section">
    <h4 className="engineering-structure-tree__section-title">
      {title}
      <span data-testid={testId}> {items.length}</span>
    </h4>
    <ol className="engineering-structure-tree__list">
      {items.length > 0 ? (
        items.map((item) => {
          const isSelected = item.elementIds.some(
            (elementId) => !!selectedElementIds[elementId],
          );

          return (
            <li key={item.entityId}>
              <button
                type="button"
                className="engineering-structure-tree__item"
                data-selected={isSelected ? "true" : "false"}
                data-testid={`engineering-structure-node-${item.entityId}`}
                onClick={() => onSelect(item)}
              >
                <span>{item.label}</span>
                {item.detail ? (
                  <span className="engineering-structure-tree__detail">
                    {" "}
                    {item.detail}
                  </span>
                ) : null}
              </button>
            </li>
          );
        })
      ) : (
        <li className="engineering-structure-tree__detail">暂无</li>
      )}
    </ol>
  </section>
);

export const EngineeringStructureTreePanel = () => {
  const app = useApp();
  const appState = useExcalidrawAppState();
  const elements = useExcalidrawElements();
  const setAppState = useExcalidrawSetAppState();
  const structureTree = useAtomValue(engineeringStructureTreeAtom);
  const project = useAtomValue(engineeringProjectDocumentAtom);
  const runtimeProjection = useAtomValue(engineeringRuntimeProjectionAtom);
  const componentNameVariableIdByComponentId =
    buildComponentNameVariableIdByComponentId(structureTree, project);
  const components = structureTree.components.map((component) => ({
    ...component,
    label: toResolvedComponentLabel({
      componentId: component.entityId,
      fallbackLabel: component.label,
      project,
      runtimeProjection,
      componentNameVariableIdByComponentId,
    }),
  }));
  const pipes = structureTree.pipes.map((pipe) => {
    const topologyPipe = project.topology.pipesById[pipe.entityId];
    if (!topologyPipe) {
      return pipe;
    }

    const sourceAnchor = project.topology.anchorsById[topologyPipe.fromAnchorId];
    const targetAnchor = project.topology.anchorsById[topologyPipe.toAnchorId];
    const sourceComponentId = sourceAnchor?.componentId;
    const targetComponentId = targetAnchor?.componentId;
    const sourceComponentLabel = sourceComponentId
      ? toResolvedComponentLabel({
          componentId: sourceComponentId,
          fallbackLabel:
            project.topology.componentsById[sourceComponentId]?.id ||
            sourceComponentId,
          project,
          runtimeProjection,
          componentNameVariableIdByComponentId,
        })
      : "Unknown";
    const targetComponentLabel = targetComponentId
      ? toResolvedComponentLabel({
          componentId: targetComponentId,
          fallbackLabel:
            project.topology.componentsById[targetComponentId]?.id ||
            targetComponentId,
          project,
          runtimeProjection,
          componentNameVariableIdByComponentId,
        })
      : "Unknown";

    return {
      ...pipe,
      detail: `${sourceComponentLabel} -> ${targetComponentLabel}`,
    };
  });

  const handleSelect = (item: StructureTreeItem) => {
    const selectedElements = item.elementIds
      .map((elementId) => elements.find((element) => element.id === elementId))
      .filter((element): element is (typeof elements)[number] => !!element);

    if (selectedElements.length === 0) {
      return;
    }

    setAppState(
      selectGroupsForSelectedElements(
        {
          editingGroupId: appState.editingGroupId,
          selectedElementIds: selectedElements.reduce(
            (acc, element) => {
              acc[element.id] = true;
              return acc;
            },
            {} as Record<string, true>,
          ),
        },
        elements,
        appState,
        app,
      ),
    );
    app.scrollToContent(selectedElements, { animate: true });
  };

  return (
    <div
      className="engineering-structure-tree"
      data-testid="engineering-structure-tree"
    >
      <div className="engineering-structure-tree__header">
        <h3 className="engineering-structure-tree__title">结构树</h3>
        <span className="engineering-structure-tree__summary">
          {components.length} 组件 / {pipes.length} 管段
        </span>
      </div>
      <StructureTreeSection
        title="组件"
        items={components}
        testId="engineering-structure-components"
        onSelect={handleSelect}
        selectedElementIds={appState.selectedElementIds}
      />
      <StructureTreeSection
        title="管段"
        items={pipes}
        testId="engineering-structure-pipes"
        onSelect={handleSelect}
        selectedElementIds={appState.selectedElementIds}
      />
    </div>
  );
};
