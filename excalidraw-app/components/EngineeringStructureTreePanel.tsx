import { selectGroupsForSelectedElements } from "@excalidraw/element";
import {
  useApp,
  useExcalidrawAppState,
  useExcalidrawElements,
  useExcalidrawSetAppState,
} from "@excalidraw/excalidraw/components/App";

import { useAtomValue } from "../app-jotai";
import type { EngineeringStructureTree } from "../engineering-modeling";
import { engineeringStructureTreeAtom } from "../engineering-modeling-state";

import "./EngineeringStructureTreePanel.scss";

type StructureTreeItem = EngineeringStructureTree["components"][number];

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
          {structureTree.components.length} 组件 / {structureTree.pipes.length} 管段
        </span>
      </div>
      <StructureTreeSection
        title="组件"
        items={structureTree.components}
        testId="engineering-structure-components"
        onSelect={handleSelect}
        selectedElementIds={appState.selectedElementIds}
      />
      <StructureTreeSection
        title="管段"
        items={structureTree.pipes}
        testId="engineering-structure-pipes"
        onSelect={handleSelect}
        selectedElementIds={appState.selectedElementIds}
      />
    </div>
  );
};
