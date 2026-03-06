import { selectGroupsForSelectedElements } from "@excalidraw/element";
import {
  useApp,
  useExcalidrawAppState,
  useExcalidrawElements,
  useExcalidrawSetAppState,
} from "@excalidraw/excalidraw/components/App";
import type { ReactElement } from "react";

import { useAtomValue } from "../app-jotai";
import type { ProjectDocument, RuntimeProjection } from "../engineering-domain";
import type { EngineeringStructureTree } from "../engineering-modeling";
import { engineeringStructureTreeAtom } from "../engineering-modeling-state";
import {
  engineeringProjectDocumentAtom,
  engineeringRuntimeProjectionAtom,
} from "../engineering-domain-state";
import { engineeringWorkspaceModeAtom } from "../engineering-ui-state";

import "./EngineeringStructureTreePanel.scss";

type StructureTreeItem = EngineeringStructureTree["components"][number];
type StructureTreeAnchorItem = {
  entityId: string;
  label: string;
  detail?: string;
  anchorIndex: number;
  elementIds: string[];
};
type ComponentStructureTreeItem = StructureTreeItem & {
  anchors: StructureTreeAnchorItem[];
};

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
  renderChildren,
}: {
  title: string;
  items: StructureTreeItem[];
  testId: string;
  onSelect: (item: StructureTreeItem) => void;
  selectedElementIds: Readonly<Record<string, true>>;
  renderChildren?: (item: StructureTreeItem, isSelected: boolean) => ReactElement | null;
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
              {renderChildren ? renderChildren(item, isSelected) : null}
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
  const workspaceMode = useAtomValue(engineeringWorkspaceModeAtom);
  const componentNameVariableIdByComponentId =
    buildComponentNameVariableIdByComponentId(structureTree, project);
  const components: ComponentStructureTreeItem[] = structureTree.components.map(
    (component) => {
      const topologyComponent = project.topology.componentsById[component.entityId];
      const anchors: StructureTreeAnchorItem[] = (
        topologyComponent?.anchorIds || []
      ).map((anchorId, anchorIndex) => {
        const anchorEntity = project.topology.anchorsById[anchorId];

        return {
          entityId: anchorId,
          label: anchorEntity?.name || anchorEntity?.key || anchorId,
          detail: anchorEntity?.medium || anchorEntity?.direction,
          anchorIndex,
          elementIds: component.elementIds,
        };
      });

      return {
        ...component,
        label: toResolvedComponentLabel({
          componentId: component.entityId,
          fallbackLabel: component.label,
          project,
          runtimeProjection,
          componentNameVariableIdByComponentId,
        }),
        anchors,
      };
    },
  );
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

  const getSelectedElementsForTreeItem = (item: StructureTreeItem) =>
    item.elementIds
      .map((elementId) => elements.find((element) => element.id === elementId))
      .filter((element): element is (typeof elements)[number] => !!element);

  const handleSelect = (item: StructureTreeItem, anchorIndex: number | null) => {
    const selectedElements = getSelectedElementsForTreeItem(item);

    if (selectedElements.length === 0) {
      return;
    }

    const nextSelectionState = selectGroupsForSelectedElements(
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
    );

    setAppState({
      ...nextSelectionState,
      selectedAnchorPointIndex:
        workspaceMode === "data" && typeof anchorIndex === "number"
          ? anchorIndex
          : null,
      draggedAnchorPointIndex: null,
    });
    app.scrollToContent(selectedElements, { animate: true });
  };

  const handleSelectNode = (item: StructureTreeItem) => {
    handleSelect(item, null);
  };

  const handleSelectAnchorNode = (
    component: ComponentStructureTreeItem,
    anchor: StructureTreeAnchorItem,
  ) => {
    handleSelect(component, anchor.anchorIndex);
  };

  const renderComponentAnchors = (
    item: StructureTreeItem,
    isComponentSelected: boolean,
  ) => {
    const componentItem = item as ComponentStructureTreeItem;
    if (!componentItem.anchors.length) {
      return null;
    }

    return (
      <ol className="engineering-structure-tree__list">
        {componentItem.anchors.map((anchor) => {
          const isSelected =
            isComponentSelected && appState.selectedAnchorPointIndex === anchor.anchorIndex;

          return (
            <li key={anchor.entityId}>
              <button
                type="button"
                className="engineering-structure-tree__item engineering-structure-tree__item--anchor"
                data-selected={isSelected ? "true" : "false"}
                data-testid={`engineering-structure-node-${anchor.entityId}`}
                onClick={() => handleSelectAnchorNode(componentItem, anchor)}
              >
                <span>{anchor.label}</span>
                {anchor.detail ? (
                  <span className="engineering-structure-tree__detail">
                    {" "}
                    {anchor.detail}
                  </span>
                ) : null}
              </button>
            </li>
          );
        })}
      </ol>
    );
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
        onSelect={handleSelectNode}
        selectedElementIds={appState.selectedElementIds}
        renderChildren={renderComponentAnchors}
      />
      <StructureTreeSection
        title="管段"
        items={pipes}
        testId="engineering-structure-pipes"
        onSelect={handleSelectNode}
        selectedElementIds={appState.selectedElementIds}
      />
    </div>
  );
};
