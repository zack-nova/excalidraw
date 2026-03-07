import { selectGroupsForSelectedElements } from "@excalidraw/element";
import {
  useApp,
  useExcalidrawAppState,
  useExcalidrawElements,
  useExcalidrawSetAppState,
} from "@excalidraw/excalidraw/components/App";
import { useEffect, useState, type ReactElement } from "react";

import { useAtomValue } from "../app-jotai";
import type { ProjectDocument, RuntimeProjection } from "../engineering/engineering-domain";
import type { EngineeringStructureTree } from "../engineering/engineering-modeling";
import { isDynamicEngineeringAnchor } from "../engineering/engineering-modeling";
import { engineeringStructureTreeAtom } from "../engineering/engineering-modeling-state";
import {
  engineeringProjectDocumentAtom,
  engineeringRuntimeProjectionAtom,
} from "../engineering/engineering-domain-state";
import { engineeringWorkspaceModeAtom } from "../engineering/engineering-ui-state";

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
  isItemExpandable,
  getItemExpandedState,
}: {
  title: string;
  items: StructureTreeItem[];
  testId: string;
  onSelect: (item: StructureTreeItem) => void;
  selectedElementIds: Readonly<Record<string, true>>;
  renderChildren?: (item: StructureTreeItem, isSelected: boolean) => ReactElement | null;
  isItemExpandable?: (item: StructureTreeItem) => boolean;
  getItemExpandedState?: (item: StructureTreeItem) => boolean;
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
          const itemIsExpandable = !!isItemExpandable?.(item);
          const itemIsExpanded = !!getItemExpandedState?.(item);

          return (
            <li key={item.entityId}>
              <button
                type="button"
                className="engineering-structure-tree__item"
                data-selected={isSelected ? "true" : "false"}
                data-testid={`engineering-structure-node-${item.entityId}`}
                aria-expanded={itemIsExpandable ? itemIsExpanded : undefined}
                onClick={() => onSelect(item)}
              >
                <span>{item.label}</span>
                {item.detail ? (
                  <span className="engineering-structure-tree__detail">
                    {" "}
                    {item.detail}
                  </span>
                ) : null}
                {itemIsExpandable ? (
                  <span
                    className="engineering-structure-tree__expander"
                    data-state={itemIsExpanded ? "expanded" : "collapsed"}
                  >
                    {itemIsExpanded ? "▾" : "▸"}
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
  const [expandedComponentEntityId, setExpandedComponentEntityId] = useState<
    string | null
  >(null);
  const componentNameVariableIdByComponentId =
    buildComponentNameVariableIdByComponentId(structureTree, project);
  const components: ComponentStructureTreeItem[] = structureTree.components.map(
    (component) => {
      const topologyComponent = project.topology.componentsById[component.entityId];
      const visibleAnchorIds = (topologyComponent?.anchorIds || []).filter(
        (anchorId) => {
          const anchorEntity = project.topology.anchorsById[anchorId];
          return !!anchorEntity && !isDynamicEngineeringAnchor(anchorEntity);
        },
      );
      const anchors: StructureTreeAnchorItem[] = visibleAnchorIds.map((
        anchorId,
        anchorIndex,
      ) => {
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

  useEffect(() => {
    if (workspaceMode !== "data") {
      return;
    }

    if (typeof appState.selectedAnchorPointIndex !== "number") {
      return;
    }

    const selectedComponentItems = components.filter((component) =>
      component.elementIds.some(
        (elementId) => !!appState.selectedElementIds[elementId],
      ),
    );

    if (selectedComponentItems.length !== 1) {
      return;
    }

    const [selectedComponent] = selectedComponentItems;
    if (
      appState.selectedAnchorPointIndex < 0 ||
      appState.selectedAnchorPointIndex >= selectedComponent.anchors.length
    ) {
      return;
    }

    setExpandedComponentEntityId((current) =>
      current === selectedComponent.entityId
        ? current
        : selectedComponent.entityId,
    );
  }, [
    appState.selectedAnchorPointIndex,
    appState.selectedElementIds,
    components,
    workspaceMode,
  ]);

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

  const handleSelectComponentNode = (item: ComponentStructureTreeItem) => {
    handleSelect(item, null);
    setExpandedComponentEntityId((current) =>
      current === item.entityId ? null : item.entityId,
    );
  };

  const handleSelectAnchorNode = (
    component: ComponentStructureTreeItem,
    anchor: StructureTreeAnchorItem,
  ) => {
    setExpandedComponentEntityId(component.entityId);
    handleSelect(component, anchor.anchorIndex);
  };

  const renderComponentAnchors = (
    item: StructureTreeItem,
    isComponentSelected: boolean,
  ) => {
    const componentItem = item as ComponentStructureTreeItem;
    const isExpanded = expandedComponentEntityId === componentItem.entityId;

    if (!componentItem.anchors.length || !isExpanded) {
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
        onSelect={(item) => handleSelectComponentNode(item as ComponentStructureTreeItem)}
        selectedElementIds={appState.selectedElementIds}
        isItemExpandable={(item) => (item as ComponentStructureTreeItem).anchors.length > 0}
        getItemExpandedState={(item) => expandedComponentEntityId === item.entityId}
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
